using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace Sales.Api.Orders;

/// <summary>
/// Q28 — RESTful endpoints in ASP.NET Core.
///
/// One endpoint group per resource. The group carries the versioned route, the
/// authorisation policy and the rate-limit policy, so an endpoint cannot be
/// added without inheriting them; each endpoint then declares its own verb,
/// status codes and typed result, and holds no business rules.
/// </summary>
public static class OrdersEndpoints
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    public static RouteGroupBuilder MapOrders(this IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/api/v1/orders")
            .WithTags("Orders")
            .RequireAuthorization("orders:write")            // inherited by every endpoint below
            .RequireRateLimiting("per-caller");              // 100 requests/minute, keyed by subject

        // GET /api/v1/orders — idempotent, safe, never unbounded.
        group.MapGet("/", async Task<Ok<OrderPage>> (
            [AsParameters] OrderQuery query,
            IOrderReadStore store,
            CancellationToken cancellationToken) =>
        {
            var size = Math.Clamp(query.PageSize ?? DefaultPageSize, 1, MaxPageSize);
            var page = await store.ListAsync(query.Status, query.Sort, size, query.Cursor, cancellationToken);

            // nextCursor is absent on the last page: the client stops when it is missing.
            return TypedResults.Ok(page);
        })
        .WithName("ListOrders")
        .Produces<OrderPage>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status429TooManyRequests);

        // GET /api/v1/orders/{orderId} — 200 with an ETag, or 404. A resource the
        // caller may not see is reported as 404, not 403, so the API does not
        // confirm the existence of other tenants' data.
        group.MapGet("/{orderId:guid}", async Task<Results<Ok<OrderResponse>, NotFound<ProblemDetails>>> (
            Guid orderId,
            HttpContext http,
            IOrderReadStore store,
            ICurrentUser currentUser,
            CancellationToken cancellationToken) =>
        {
            var order = await store.FindAsync(orderId, currentUser.SubjectId, cancellationToken);
            if (order is null) return TypedResults.NotFound(Problem.ForOrder(orderId, http.TraceIdentifier));

            http.Response.Headers.ETag = order.Version;   // If-Match is checked on PUT
            return TypedResults.Ok(order);
        })
        .WithName("GetOrder")
        .Produces<OrderResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status404NotFound);

        // POST /api/v1/orders — not idempotent, so it accepts an Idempotency-Key and
        // answers 201 with a Location header.
        group.MapPost("/", async Task<Results<Created<OrderResponse>, ValidationProblem, Conflict<ProblemDetails>>> (
            CreateOrderRequest request,
            [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
            ISender sender,
            LinkGenerator links,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.SendAsync(
                new CreateOrderCommand(request.Lines, idempotencyKey, http.TraceIdentifier),
                cancellationToken);

            return result.Status switch
            {
                // The same key with the same payload returns the original response
                // instead of creating a second order.
                ResultStatus.Ok => TypedResults.Created(
                    links.GetPathByName("GetOrder", new { orderId = result.Value.Id })!,
                    result.Value),
                ResultStatus.Invalid => TypedResults.ValidationProblem(result.Errors),
                _      => TypedResults.Conflict(Problem.From(result, http.TraceIdentifier)),
            };
        })
        .WithName("CreateOrder")
        .Produces<OrderResponse>(StatusCodes.Status201Created)
        .ProducesValidationProblem()
        .ProducesProblem(StatusCodes.Status409Conflict);

        // PUT /api/v1/orders/{orderId} — idempotent and guarded by If-Match, so a
        // client that lost the race receives 412 instead of silently overwriting a
        // change it never saw. A missing precondition is 428, not 400.
        group.MapPut("/{orderId:guid}", async Task<Results<Ok<OrderResponse>, NotFound<ProblemDetails>, StatusCodeHttpResult>> (
            Guid orderId,
            UpdateOrderRequest request,
            [FromHeader(Name = "If-Match")] string? ifMatch,
            ISender sender,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(ifMatch))
                return TypedResults.StatusCode(StatusCodes.Status428PreconditionRequired);

            var result = await sender.SendAsync(
                new UpdateOrderCommand(orderId, request.Reason, ifMatch, http.TraceIdentifier),
                cancellationToken);

            return result.Status switch
            {
                ResultStatus.Ok           => TypedResults.Ok(result.Value),
                ResultStatus.NotFound     => TypedResults.NotFound(Problem.From(result, http.TraceIdentifier)),
                ResultStatus.Precondition => TypedResults.StatusCode(StatusCodes.Status412PreconditionFailed),
                _                         => TypedResults.StatusCode(StatusCodes.Status500InternalServerError),
            };
        })
        .WithName("ReplaceOrder")
        .Produces<OrderResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status412PreconditionFailed)
        .Produces(StatusCodes.Status428PreconditionRequired);

        // DELETE /api/v1/orders/{orderId} — idempotent, 204 either way. Cancelling
        // an already cancelled order is not an error; it is a satisfied request.
        group.MapDelete("/{orderId:guid}", async Task<Results<NoContent, Conflict<ProblemDetails>>> (
            Guid orderId,
            ISender sender,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.SendAsync(new CancelOrderCommand(orderId), cancellationToken);

            return result.Status switch
            {
                ResultStatus.Ok or ResultStatus.NotFound => TypedResults.NoContent(),
                _ => TypedResults.Conflict(Problem.From(result, http.TraceIdentifier)),
            };
        })
        .WithName("CancelOrder")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status409Conflict);

        // POST /api/v1/orders/{orderId}/confirm — the state transition is a
        // sub-resource receiving POST, not a verb grafted onto the URL.
        group.MapPost("/{orderId:guid}/confirm", async Task<Results<NoContent, ValidationProblem, Conflict<ProblemDetails>>> (
            Guid orderId,
            ISender sender,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.SendAsync(new ConfirmOrderCommand(orderId), cancellationToken);

            return result.Status switch
            {
                ResultStatus.Ok      => TypedResults.NoContent(),
                ResultStatus.Invalid => TypedResults.ValidationProblem(result.Errors),
                _                    => TypedResults.Conflict(Problem.From(result, http.TraceIdentifier)),
            };
        })
        .WithName("ConfirmOrder")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status409Conflict);

        return group;
    }
}

/// <summary>
/// Query parameters bound as a single object, so the filter and sort grammar is
/// declared once and documented in the OpenAPI document.
/// </summary>
public sealed record OrderQuery
{
    public string? Status { get; init; }
    public string? Sort { get; init; } = "-createdAt";

    [FromQuery(Name = "page[size]")]
    public int? PageSize { get; init; }

    [FromQuery(Name = "page[after]")]
    public string? Cursor { get; init; }
}

/// <summary>RFC 7807 factory: one error shape for every failure mode.</summary>
internal static class Problem
{
    public static ProblemDetails ForOrder(Guid orderId, string traceId) => new()
    {
        Status = StatusCodes.Status404NotFound,
        Title = "Order not found",
        Type = "https://docs.example.com/problems/404",
        Extensions = { ["traceId"] = traceId, ["orderId"] = orderId },
    };

    public static ProblemDetails From(UseCaseResult<OrderResponse> result, string traceId) => new()
    {
        Status = result.HttpStatus,
        Title = result.Title,
        Detail = result.Message,
        Type = $"https://docs.example.com/problems/{result.HttpStatus}",
        Extensions = { ["traceId"] = traceId },
    };
}
