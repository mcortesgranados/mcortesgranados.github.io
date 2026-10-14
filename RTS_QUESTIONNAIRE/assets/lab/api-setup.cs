using System;
using System.Threading.Tasks;
using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Sales.Api;

/// <summary>
/// Q37 — the cross-cutting concerns wired once instead of recalled at each endpoint.
///
/// Versioning, authentication, authorization and validation are all decided here, in
/// the composition root, because a concern that is applied per endpoint is a concern
/// that will be forgotten at one endpoint. The remaining two — exception handling and
/// observability — are in exception-handling.cs and observability.yaml.
/// </summary>
public static class ApiSetup
{
    public static IServiceCollection AddOrderApi(this IServiceCollection services, IConfiguration configuration)
    {
        // ---------------------------------------------------------------- versioning
        services
            .AddApiVersioning(options =>
            {
                // The URL is the primary reader, because it is the version a client
                // actually pins in its configuration and can see in its logs.
                options.ApiVersionReader = ApiVersionReader.Combine(
                    new UrlSegmentApiVersionReader(),
                    // The header is accepted as well, for internal callers that route
                    // through a gateway which rewrites paths.
                    new HeaderApiVersionReader("api-version"));

                // No silent default. AssumeDefaultVersionWhenUnspecified = true looks
                // helpful and is how a new client accidentally binds to v1 forever:
                // the missing version becomes an explicit 400 instead.
                options.AssumeDefaultVersionWhenUnspecified = false;

                options.ReportApiVersions = true;              // api-supported-versions header
                options.DefaultApiVersion = new ApiVersion(2, 0);
            })
            .AddApiExplorer(options =>
            {
                // One OpenAPI document per version, so the client teams see the contract
                // for the version they call rather than the union of all of them.
                options.GroupNameFormat = "'v'VVV";
                options.SubstituteApiVersionInUrl = true;
            });

        // ---------------------------------------------------- authentication / authz
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = configuration["Auth:Authority"];
                options.Audience = configuration["Auth:Audience"];

                // The signing keys come from the issuer metadata and are cached with a
                // refresh on a key-id change, so a rotation is picked up without a
                // redeploy and without validating on every request.
                options.TokenValidationParameters = new()
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ClockSkew = TimeSpan.FromSeconds(30),      // not the 5-minute default
                };
            });

        services.AddAuthorization(options =>
        {
            // Named requirements, one per capability. Reading a claim inline in a
            // controller decision is how the same check ends up implemented twice and
            // differently.
            options.AddPolicy(Policies.OrdersWrite, policy => policy
                .RequireAuthenticatedUser()
                .RequireClaim("scope", "orders:write")
                .RequireClaim("tenant"));

            options.AddPolicy(Policies.OrdersRead, policy => policy
                .RequireAuthenticatedUser()
                .RequireClaim("scope", "orders:read"));

            // A fallback policy means a new endpoint is protected by default: the
            // failure mode is an endpoint nobody can call, not one everybody can.
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();
        });

        // --------------------------------------------------------------- validation
        services.AddValidatorsFromAssemblyContaining<CreateOrderValidator>(ServiceLifetime.Singleton);

        return services;
    }

    public static IApplicationBuilder UseOrderApi(this WebApplication app)
    {
        // Validation is a filter rather than a check inside each action, so every
        // endpoint reports every failure at once instead of the first one it meets.
        return app.UseMiddleware<ValidationMiddleware>();
    }
}

public static class Policies
{
    public const string OrdersRead = "orders:read";
    public const string OrdersWrite = "orders:write";
}

/// <summary>
/// The edge validator. It checks the shape and the format of the request — required
/// fields, lengths, ranges, formats — and deliberately knows nothing about business
/// rules, which belong to the aggregate and are already enforced there.
/// </summary>
public sealed class CreateOrderValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderValidator()
    {
        RuleFor(request => request.CustomerId)
            .NotEmpty()
            .WithMessage("CustomerId is required.")
            .WithErrorCode("customer_id_required");

        RuleFor(request => request.Lines)
            .NotEmpty().WithMessage("At least one line is required.")
            .WithErrorCode("lines_required");

        RuleForEach(request => request.Lines)
            .ChildRules(line =>
            {
                line.RuleFor(item => item.Sku).NotEmpty().MaximumLength(64);
                line.RuleFor(item => item.Quantity).GreaterThan(0);
                line.RuleFor(item => item.UnitPrice).GreaterThan(0);
            });
    }
}

/// <summary>
/// An endpoint's cross-cutting metadata is declared in one place, next to the route.
/// The authorisation requirement is visible in the definition rather than inherited
/// from a convention somebody has to remember.
/// </summary>
public static class OrderEndpoints
{
    public static RouteGroupBuilder MapOrderEndpointsV2(this IEndpointRouteBuilder routes)
    {
        var group = routes
            .NewApiVersionSet()
            .HasApiVersion(new ApiVersion(2, 0))
            .ReportApiVersions()
            .Build();

        return routes
            .MapGroup("/api/v{version:apiVersion}/orders")
            .WithApiVersionSet(group)
            .MapToApiVersion(new ApiVersion(2, 0))
            .RequireAuthorization(Policies.OrdersWrite);
    }
}
