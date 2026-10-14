using System;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sales.Application.Orders.ConfirmOrder;

namespace Sales.Api.Orders;

/// <summary>
/// API / Presentation layer for Q27.
///
/// This file is deliberately thin. Everything here is transport: routing, model
/// binding, validation of the shape of the request, authentication, and the
/// translation of a use-case result into an HTTP response. There is no branch
/// that decides whether an order may be confirmed — that decision belongs to the
/// domain, and the use case is the only thing this layer is allowed to call.
/// </summary>
[ApiController]
[Route("orders")]
[Authorize(Policy = "orders:write")]
public sealed class OrdersController : ControllerBase
{
    private readonly IConfirmOrderHandler _handler;

    // The controller depends on a port declared by the application layer.
    // It cannot name EfOrderRepository, SalesDbContext or any other adapter.
    public OrdersController(IConfirmOrderHandler handler) => _handler = handler;

    /// <summary>
    /// POST /orders/{id}/confirm
    ///
    /// 204 when the order is confirmed, 404 when it does not exist, 403 when it
    /// belongs to another customer, 400 with problem details when the domain
    /// rejected the transition, 409 when the request was already applied.
    /// </summary>
    [HttpPost("{id:guid}/confirm")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ConfirmAsync(
        Guid id,
        [FromBody] ConfirmOrderRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        // Shape validation is the edge's job; it is not a business rule.
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var command = new ConfirmOrderCommand(
            OrderId: id,
            CustomerId: request.CustomerId,
            IdempotencyKey: idempotencyKey);

        var result = await _handler.HandleAsync(command, cancellationToken);

        return result.Status switch
        {
            ResultStatus.Ok        => NoContent(),
            ResultStatus.NotFound  => NotFound(Problem(result, StatusCodes.Status404NotFound, "Order not found")),
            ResultStatus.Forbidden => StatusCode(StatusCodes.Status403Forbidden, Problem(result, StatusCodes.Status403Forbidden, "Not your order")),
            ResultStatus.Invalid   => BadRequest(Problem(result, StatusCodes.Status400BadRequest, "Order cannot be confirmed")),
            ResultStatus.Conflict  => Conflict(Problem(result, StatusCodes.Status409Conflict, "Already applied")),
            _                      => StatusCode(StatusCodes.Status500InternalServerError, "Unexpected use-case status"),
        };
    }

    /// <summary>
    /// RFC 7807 shape, built from the use-case result. The client never sees an
    /// exception message or a stack trace, and it never sees an entity either.
    /// </summary>
    private static ProblemDetails Problem(UseCaseResult<OrderResponse> result, int status, string title) => new()
    {
        Status = status,
        Title = title,
        Detail = result.Message,
        Type = $"https://docs.mcortesgranados.dev/problems/{status}",
        Extensions = { ["traceId"] = result.TraceId },
    };
}

/// <summary>
/// Request DTO. The wire contract is its own type: it is not the domain entity
/// and it is not the database row, so the schema can change on either side
/// without dragging the API contract with it.
/// </summary>
public sealed record ConfirmOrderRequest(
    [property: Required] Guid CustomerId,
    [property: StringLength(64)] string? Reason)
{
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (CustomerId == Guid.Empty)
        {
            yield return new ValidationResult("CustomerId is required.", new[] { nameof(CustomerId) });
        }
    }
}
