using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Sales.Fabric.Identity;

/// <summary>
/// Q45 — identity across service hops.
///
/// Three distinct cases, and conflating them is where most of the trouble comes from:
///
///   1. A user's request arriving at the edge. The edge validates the token; every
///      service downstream validates it again and enforces its own policy, because a
///      service that trusts its caller has no security of its own.
///   2. A service acting on behalf of that user. The identity is propagated so the
///      audit trail is correct, and the receiving service applies the *user's* scopes.
///   3. A pure machine call with no user involved. It authenticates as itself with
///      client credentials or mTLS and holds its own narrow scopes.
///
/// The token itself is never logged, never written to a header a client could spoof,
/// and never read from configuration.
/// </summary>
public interface IServiceTokenProvider
{
    Task<string> GetTokenAsync(IReadOnlyCollection<string> scopes, CancellationToken cancellationToken);
}

/// <summary>
/// The client-credentials provider. Two details matter: the token is cached until just
/// before it expires, and concurrent callers on a cold cache share one request instead
/// of opening a stampede against the identity provider.
/// </summary>
public sealed class ClientCredentialsTokenProvider : IServiceTokenProvider
{
    private readonly IIdentityProviderClient _identity;
    private readonly IServiceCredentialSource _credentials;   // reads the vault, not appsettings
    private readonly ILogger<ClientCredentialsTokenProvider> _logger;
    private readonly ConcurrentDictionary<string, CachedToken> _cache = new();
    private readonly SemaphoreSlim _refresh = new(1, 1);

    public ClientCredentialsTokenProvider(
        IIdentityProviderClient identity,
        IServiceCredentialSource credentials,
        ILogger<ClientCredentialsTokenProvider> logger)
    {
        _identity = identity;
        _credentials = credentials;
        _logger = logger;
    }

    public async Task<string> GetTokenAsync(IReadOnlyCollection<string> scopes, CancellationToken cancellationToken)
    {
        var key = string.Join(' ', scopes);

        if (_cache.TryGetValue(key, out var cached) && cached.IsValid(DateTimeOffset.UtcNow))
        {
            return cached.Value;
        }

        await _refresh.WaitAsync(cancellationToken);
        try
        {
            // Re-check inside the lock: another caller may have refreshed while this
            // one waited, and a stampede against the identity provider is an outage
            // with extra steps.
            if (_cache.TryGetValue(key, out cached) && cached.IsValid(DateTimeOffset.UtcNow))
            {
                return cached.Value;
            }

            var (clientId, clientSecret) = await _credentials.GetAsync(cancellationToken);
            var token = await _identity.ClientCredentialsAsync(clientId, clientSecret, scopes, cancellationToken);

            _cache[key] = new CachedToken(token.Value, token.ExpiresAt);

            // The scope is logged; the token is not, and neither is the secret.
            _logger.LogInformation(
                "acquired service token for scopes [{Scopes}], valid for {Minutes} minutes",
                key, (token.ExpiresAt - DateTimeOffset.UtcNow).TotalMinutes);

            return token.Value;
        }
        finally
        {
            _refresh.Release();
        }
    }

    private sealed record CachedToken(string Value, DateTimeOffset ExpiresAt)
    {
        /// <summary>Refresh 60 s early: a token that expires in flight is a 401 with no cause.</summary>
        public bool IsValid(DateTimeOffset now) => now < ExpiresAt - TimeSpan.FromSeconds(60);
    }
}

/// <summary>
/// The caller's identity, reconstructed from validated claims only.
///
/// Note what is absent: any property that reads a tenant or a user id from the request
/// body, a query string or a header. A body-supplied identity is the single most common
/// way an internal API becomes an authorisation bypass.
/// </summary>
public interface ICurrentUser
{
    string SubjectId { get; }
    string TenantId { get; }
    IReadOnlyCollection<string> Scopes { get; }
    bool IsOnBehalfOfAUser { get; }
}

public sealed class CurrentUser : ICurrentUser
{
    private readonly ClaimsPrincipal _principal;

    public CurrentUser(IHttpContextAccessor accessor)
    {
        _principal = accessor.HttpContext?.User ?? new ClaimsPrincipal();
    }

    public string SubjectId => _principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
        ?? _principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? throw new UnauthenticatedCall();

    public string TenantId => _principal.FindFirst("tenant")?.Value ?? throw new UnauthenticatedCall();

    public IReadOnlyCollection<string> Scopes =>
        _principal.FindAll("scope").Select(claim => claim.Value).ToArray();

    /// <summary>
    /// True when the token came from a user rather than from a service. An on-behalf-of
    /// call carries the user's subject, which is what keeps the audit trail honest.
    /// </summary>
    public bool IsOnBehalfOfAUser => !_principal.HasClaim("client_id", SubjectId);
}

/// <summary>
/// The outbound handler. It attaches the right identity for the call being made, and
/// it strips anything a client could have smuggled in: an inbound header that claims an
/// internal identity is removed before the hop, never forwarded.
/// </summary>
public sealed class ServiceIdentityHandler : DelegatingHandler
{
    private readonly IServiceTokenProvider _tokens;
    private readonly ICurrentUser _caller;
    private readonly IServiceScopeMap _scopes;
    private readonly ILogger<ServiceIdentityHandler> _logger;

    public ServiceIdentityHandler(
        IServiceTokenProvider tokens,
        ICurrentUser caller,
        IServiceScopeMap scopes,
        ILogger<ServiceIdentityHandler> logger)
    {
        _tokens = tokens;
        _caller = caller;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        // Never trust these from the caller: they are written here or not at all.
        request.Headers.Remove("x-internal-identity");
        request.Headers.Remove("x-tenant-id");

        if (_caller.IsOnBehalfOfAUser)
        {
            // Case 2: propagate the user, so the receiving service enforces the user's
            // scopes and its audit record names the human who asked.
            request.Headers.Authorization = new("Bearer", await _tokens.GetTokenAsync(_caller.Scopes, cancellationToken));
            request.Headers.Add("x-tenant-id", _caller.TenantId);
        }
        else
        {
            // Case 3: a machine call. The scope is derived from the destination, not
            // from whatever the caller happened to be holding.
            var required = _scopes.RequiredFor(request.RequestUri!);

            request.Headers.Authorization = new("Bearer", await _tokens.GetTokenAsync(required, cancellationToken));
            request.Headers.Add("x-calling-service", _caller.SubjectId);
        }

        var response = await base.SendAsync(request, cancellationToken);

        if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
        {
            // A 401 or 403 outbound is a configuration defect, not a user error: the
            // scope map and the destination's policy have drifted apart.
            _logger.LogError(
                "downstream {Host}{Path} rejected this service: {Status}. The scope map and the destination policy disagree.",
                request.RequestUri!.Host, request.RequestUri.AbsolutePath, (int)response.StatusCode);
        }

        return response;
    }
}

/// <summary>
/// The registration. Every typed client that leaves this service goes through the
/// identity handler, so attaching the wrong credential, or forgetting to strip a
/// spoofed internal header, is not something an individual call site can get wrong.
///
/// The two internal transports are configured here rather than at the call site:
/// a token-based client for edges that act on behalf of a user, and mTLS for edges
/// where there is no user and the certificate itself is the credential.
/// </summary>
public static class ServiceClientsSetup
{
    public static IServiceCollection AddServiceClients(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddTransient<ServiceIdentityHandler>();
        services.AddTransient<CertificatePresentationHandler>();
        services.AddSingleton<IServiceTokenProvider, ClientCredentialsTokenProvider>();
        services.AddScoped<ICurrentUser, CurrentUser>();

        // Token-based internal calls: authenticate as this service, on behalf of the
        // user when there is one.
        services
            .AddHttpClient<ICustomersApi, CustomersApiClient>(client =>
            {
                client.BaseAddress = new Uri(configuration["Services:Customers:BaseUrl"]!);
                client.Timeout = TimeSpan.FromSeconds(3);   // the deadline lives here, not in each call
            })
            .AddHttpMessageHandler<ServiceIdentityHandler>();

        // mTLS internal calls: the client certificate is loaded from the platform's
        // mounted secret and rotated on the schedule the platform sets.
        services
            .AddHttpClient<IInventoryApi, InventoryApiClient>(client =>
            {
                client.BaseAddress = new Uri(configuration["Services:Inventory:BaseUrl"]!);
                client.Timeout = TimeSpan.FromSeconds(2);
            })
            .ConfigurePrimaryHttpMessageHandler(provider =>
            {
                var certificates = provider.GetRequiredService<IClientCertificateSource>();

                return new HttpClientHandler
                {
                    ClientCertificateOptions = ClientCertificateOption.Manual,
                    SslCertificateAuthentication = new()
                    {
                        // The internal CA only: pinning the issuer is what stops a
                        // valid certificate from anywhere else being accepted.
                        CustomTrustStore = certificates.TrustedIssuers(),
                        TrustMode = SslCertificateTrustMode.CustomRootTrust,
                    },
                };
            });

        return services;
    }
}

/// <summary>Presents the client certificate on the internal edges. Rotated by the platform.</summary>
public sealed class CertificatePresentationHandler : DelegatingHandler
{
    private readonly IClientCertificateSource _certificates;

    public CertificatePresentationHandler(IClientCertificateSource certificates) => _certificates = certificates;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var certificate = await _certificates.CurrentAsync(cancellationToken);

        // No bearer token on this edge: the certificate is the credential, and mixing
        // the two would leave two things to revoke.
        request.Headers.Remove("Authorization");

        return await base.SendAsync(request, cancellationToken);
    }
}
