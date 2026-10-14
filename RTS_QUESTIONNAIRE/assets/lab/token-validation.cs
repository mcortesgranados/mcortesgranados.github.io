using System;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Rts.Questionnaire.Security;

/// <summary>
/// Token validation is configured once, at the composition root: the API never
/// decodes a token and trusts it. Issuer, audience, lifetime and signing keys are
/// all verified against the provider's published JWKS, and authorization is
/// expressed as a policy over claims instead of hard-coded role strings.
/// </summary>
public static class AuthenticationSetup
{
    public static IServiceCollection AddProviderAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var authority = configuration["Identity:Authority"];

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = authority;                              // discovery + JWKS
                options.Audience = configuration["Identity:Audience"];
                options.RequireHttpsMetadata = true;                        // never over plain HTTP
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,                                // exp + clock skew
                    ValidateIssuerSigningKey = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "preferred_username",
                };
            });

        // Least privilege is declared once and enforced everywhere.
        services.AddAuthorizationBuilder()
            .AddPolicy("orders.write", policy => policy
                .RequireAuthenticatedUser()
                .RequireClaim("scope", "orders.write")
                .RequireClaim("tenant"));

        return services;
    }

    /// <summary>
    /// A SPA uses Authorization Code + PKCE: no client secret is shipped to the
    /// browser and the code cannot be redeemed without the verifier.
    /// </summary>
    public const string SpaFlow =
        "response_type=code&code_challenge_method=S256&scope=openid profile api.read";
}
