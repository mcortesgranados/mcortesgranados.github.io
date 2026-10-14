using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Sales.EventSourcing;

/// <summary>
/// Q46 — the event-sourced aggregate and the append contract.
///
/// The two properties that make event sourcing safe to run, and that are usually
/// discovered the hard way:
///
///   1. An append declares the version it expects. Two writers racing for the same
///      stream is not a lost update to be retried silently — it is a conflict the
///      caller has to see, exactly like a row version in a relational store.
///   2. The log is never rewritten. A schema change is an upcaster applied on read, so
///      an event written in 2021 still parses in 2026 without a migration that would
///      turn the audit trail into a lie.
///
/// Event sourcing is deliberately not used for CRUD-shaped data — see the note at the
/// bottom of this file. Applying it everywhere is the most common way the pattern is
/// over-used, and the cost is permanent: every event ever written is part of the API.
/// </summary>
public sealed class OrderEventStore
{
    private readonly IEventLog _log;
    private readonly ISnapshotStore _snapshots;
    private readonly IClock _clock;
    private const int SnapshotEvery = 50;

    public OrderEventStore(IEventLog log, ISnapshotStore snapshots, IClock clock)
    {
        _log = log;
        _snapshots = snapshots;
        _clock = clock;
    }

    /// <summary>
    /// Appends to a stream. <paramref name="expectedVersion"/> is the concurrency
    /// control: the caller read the aggregate at that version, and anything else means
    /// somebody else wrote first.
    /// </summary>
    public async Task<AppendResult> AppendAsync(
        Guid orderId,
        int expectedVersion,
        IReadOnlyCollection<IDomainEvent> events,
        CancellationToken cancellationToken)
    {
        if (events.Count == 0) return AppendResult.NoEvents();

        try
        {
            var stored = events
                .Select((domainEvent, offset) => StoredEvent.From(
                    streamId: orderId,
                    version: expectedVersion + offset + 1,
                    domainEvent,
                    occurredAt: _clock.UtcNow))
                .ToArray();

            var appended = await _log.AppendAsync(
                streamId: orderId,
                expectedVersion: expectedVersion,
                events: stored,
                cancellationToken: cancellationToken);

            if (!appended) return AppendResult.Conflict(expectedVersion, await _log.CurrentVersionAsync(orderId, cancellationToken));

            return AppendResult.Ok(expectedVersion + events.Count);
        }
        catch (UniqueViolationException)
        {
            // The unique constraint on (stream_id, version) is the real arbiter: it holds
            // even if two appends reach the database at the same instant, which is the
            // case the application-level check alone cannot cover.
            return AppendResult.Conflict(expectedVersion, await _log.CurrentVersionAsync(orderId, cancellationToken));
        }
    }

    /// <summary>
    /// Rebuilds the aggregate. A snapshot shortens the replay; it never replaces the
    /// log, because a snapshot that disagrees with the events is a snapshot that has to
    /// be discarded and rebuilt.
    /// </summary>
    public async Task<Order> LoadAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var snapshot = await _snapshots.GetAsync(orderId, cancellationToken);
        var fromVersion = snapshot?.Version ?? 0;

        var events = await _log.ReadAsync(orderId, fromVersion, cancellationToken);

        var order = snapshot is null ? new Order() : Order.FromSnapshot(snapshot);

        foreach (var stored in events)
        {
            // Upcast before applying: the aggregate only ever sees the current version
            // of an event, which is what lets the schema evolve without rewriting the log.
            order.Apply(Upcast(stored));
        }

        return order;
    }

    /// <summary>
    /// Snapshots are an optimisation with a cost: they can be wrong, and the only way
    /// to be sure is to be able to rebuild them from the log, which is why this is a
    /// supported operation rather than an incident procedure.
    /// </summary>
    public async Task SnapshotIfDueAsync(Order order, CancellationToken cancellationToken)
    {
        if (order.Version % SnapshotEvery != 0) return;

        await _snapshots.SaveAsync(order.ToSnapshot(), cancellationToken);
    }

    /// <summary>
    /// Upcasting: the log stays immutable, the interpreter changes. Each case is the
    /// migration that a relational schema would have needed, except that it costs
    /// nothing to run and cannot lose data.
    /// </summary>
    private static IDomainEvent Upcast(StoredEvent stored) => stored.EventName switch
    {
        "OrderOpened" when stored.SchemaVersion == 1 => new OrderOpenedV2(stored),
        // An unknown event type is not an error: a projection or an aggregate that does
        // not care about it must keep working when a producer adds one.
        _ => stored.Deserialize(),
    };
}

/// <summary>
/// The aggregate. It holds no public setters: the only way to change it is to raise an
/// event, which is what makes the state in memory a function of the log rather than a
/// second source of truth that can drift from it.
/// </summary>
public sealed class Order
{
    private readonly List<IDomainEvent> _uncommitted = new();
    private readonly Dictionary<string, int> _lineQuantities = new();

    public Guid Id { get; private set; }
    public int Version { get; private set; }
    public OrderStatus Status { get; private set; } = OrderStatus.Unknown;
    public IReadOnlyCollection<IDomainEvent> Uncommitted => _uncommitted;

    public void Open(Guid customerId)
    {
        if (Status is not OrderStatus.Unknown) throw new DomainValidationException("The order already exists.");
        Raise(new OrderOpenedV2(Id, customerId, DateTimeOffset.UtcNow));
    }

    public void Confirm(DateTimeOffset at)
    {
        if (Status is not OrderStatus.Open) throw new DomainValidationException($"An order in state {Status} cannot be confirmed.");
        if (_lineQuantities.Count == 0) throw new DomainValidationException("An empty order cannot be confirmed.");

        Raise(new OrderConfirmed(Id, at));
    }

    public void Apply(IDomainEvent domainEvent)
    {
        switch (domainEvent)
        {
            case OrderOpenedV2 opened:
                Id = opened.OrderId;
                Status = OrderStatus.Open;
                break;

            case OrderLineAdded line:
                _lineQuantities[line.Sku] = _lineQuantities.GetValueOrDefault(line.Sku) + line.Quantity;
                break;

            case OrderConfirmed:
                Status = OrderStatus.Confirmed;
                break;

            case OrderCancelled:
                Status = OrderStatus.Cancelled;
                break;

            default:
                // Unrecognised events are ignored rather than throwing, so a producer can
                // add one without breaking every consumer and aggregate that reads the log.
                break;
        }

        Version += 1;
    }

    private void Raise(IDomainEvent domainEvent)
    {
        Apply(domainEvent);
        _uncommitted.Add(domainEvent);
    }

    public static Order FromSnapshot(OrderSnapshot snapshot) => new()
    {
        Id = snapshot.OrderId,
        Status = snapshot.Status,
        Version = snapshot.Version,
    };

    public OrderSnapshot ToSnapshot() => new(Id, Status, Version);
}

// ---------------------------------------------------------------------------
// Where event sourcing is NOT used, and why it is written down.
//
// Reference data, configuration, catalogue entries and user preferences are CRUD: the
// current state is the whole truth, nobody asks what the value was three years ago, and
// a log would add an append-only table with no reader. Event sourcing these would cost
// storage, a projection and a permanent schema obligation, and buy nothing.
//
// The rule applied: event-source where the history is a business requirement (financial
// movements, approvals, workflow state), and store current state where it is not.
// ---------------------------------------------------------------------------
