using System.Threading;
using System.Threading.Tasks;
using Sales.Domain.Orders;

namespace Sales.Application.Orders.ConfirmOrder;

/// <summary>
/// Application layer. The use case orchestrates the domain and depends only on
/// interfaces it declares itself (ports), so the persistence technology, the
/// clock and the event bus are decisions made outside this layer.
/// </summary>
public sealed class ConfirmOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IEventPublisher _events;

    public ConfirmOrderHandler(
        IOrderRepository orders,
        IUnitOfWork unitOfWork,
        IClock clock,
        IEventPublisher events)
    {
        _orders = orders;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _events = events;
    }

    public async Task<Result<OrderDto>> HandleAsync(ConfirmOrderCommand command, CancellationToken cancellationToken = default)
    {
        var order = await _orders.FindAsync(command.OrderId, cancellationToken);
        if (order is null) return Result<OrderDto>.NotFound($"Order {command.OrderId} does not exist.");

        if (order.CustomerId != command.CustomerId)
        {
            // Authorisation belongs to the use case, not to the controller.
            return Result<OrderDto>.Forbidden("The order belongs to another customer.");
        }

        try
        {
            order.Confirm(_clock.UtcNow);                  // domain decides, application orchestrates
        }
        catch (DomainException failure)
        {
            return Result<OrderDto>.Invalid(failure.Message);   // expected failure, not an exception to the client
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _events.PublishAsync(order.Events, cancellationToken);   // outbox-backed, after the commit

        return Result<OrderDto>.Success(OrderDto.From(order));
    }
}

/// <summary>Ports owned by this layer: the outer layer implements, never the reverse.</summary>
public interface IOrderRepository
{
    Task<Order?> FindAsync(System.Guid id, CancellationToken cancellationToken = default);
}

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IClock
{
    System.DateTimeOffset UtcNow { get; }
}

public interface IEventPublisher
{
    Task PublishAsync(System.Collections.Generic.IReadOnlyCollection<IDomainEvent> events, CancellationToken cancellationToken = default);
}

public sealed record ConfirmOrderCommand(System.Guid OrderId, System.Guid CustomerId);

/// <summary>Result instead of exceptions: the caller cannot ignore the failure branch.</summary>
public readonly record struct Result<T>
{
    private Result(T? value, string? error, ResultKind kind) { Value = value; Error = error; Kind = kind; }

    public T? Value { get; }
    public string? Error { get; }
    public ResultKind Kind { get; }

    public static Result<T> Success(T value) => new(value, null, ResultKind.Success);
    public static Result<T> NotFound(string error) => new(default, error, ResultKind.NotFound);
    public static Result<T> Forbidden(string error) => new(default, error, ResultKind.Forbidden);
    public static Result<T> Invalid(string error) => new(default, error, ResultKind.Invalid);
}

public enum ResultKind { Success, NotFound, Forbidden, Invalid }

/// <summary>The contract the presentation layer serialises. Never the entity.</summary>
public sealed record OrderDto(System.Guid Id, string Status, decimal Total, string Currency)
{
    public static OrderDto From(Order order) => new(order.Id, order.Status.ToString(), order.Total().Amount, order.Total().Currency);
}
