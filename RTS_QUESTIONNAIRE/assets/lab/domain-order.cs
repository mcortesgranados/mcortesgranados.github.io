using System;
using System.Collections.Generic;
using System.Linq;

namespace Sales.Domain.Orders;

/// <summary>
/// Domain layer. Nothing here references EF Core, ASP.NET, JSON or any other
/// framework: the aggregate protects its own invariants and raises domain
/// events, which is what keeps the business rules in one place.
/// </summary>
public sealed class Order
{
    private readonly List<OrderLine> _lines = new();
    private readonly List<IDomainEvent> _events = new();

    private Order(Guid id, Guid customerId, DateTimeOffset createdAt)
    {
        Id = id;
        CustomerId = customerId;
        CreatedAt = createdAt;
        Status = OrderStatus.Open;
    }

    public Guid Id { get; }
    public Guid CustomerId { get; }
    public DateTimeOffset CreatedAt { get; }
    public OrderStatus Status { get; private set; }
    public IReadOnlyCollection<OrderLine> Lines => _lines.AsReadOnly();
    public IReadOnlyCollection<IDomainEvent> Events => _events.AsReadOnly();

    public static Order Create(Guid customerId, DateTimeOffset now)
        => new(Guid.NewGuid(), customerId, now);

    public void AddLine(string sku, int quantity, Money unitPrice)
    {
        if (quantity <= 0) throw new DomainException("Quantity must be positive.");
        if (Status != OrderStatus.Open) throw new DomainException("A closed order cannot be edited.");

        _lines.Add(new OrderLine(sku, quantity, unitPrice));
    }

    /// <summary>The rule the whole use case exists to protect.</summary>
    public void Confirm(DateTimeOffset now)
    {
        if (Status != OrderStatus.Open) throw new DomainException($"Order is already {Status}.");
        if (_lines.Count == 0) throw new DomainException("An order without lines cannot be confirmed.");

        Status = OrderStatus.Confirmed;
        _events.Add(new OrderConfirmed(Id, CustomerId, Total(), now));
    }

    public Money Total() => _lines.Aggregate(Money.Zero, (sum, line) => sum + line.Subtotal());
}

public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money Zero { get; } = new(0m, "USD");

    public static Money operator +(Money left, Money right)
        => left.Currency == right.Currency
            ? new Money(left.Amount + right.Amount, left.Currency)
            : throw new DomainException("Cannot add amounts in different currencies.");
}

public sealed record OrderLine(string Sku, int Quantity, Money UnitPrice)
{
    public Money Subtotal() => new(UnitPrice.Amount * Quantity, UnitPrice.Currency);
}

public enum OrderStatus { Open, Confirmed, Shipped, Closed }

public interface IDomainEvent { DateTimeOffset OccurredAt { get; } }

public sealed record OrderConfirmed(Guid OrderId, Guid CustomerId, Money Total, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed class DomainException : Exception
{
    public DomainException(string message) : base(message) { }
}
