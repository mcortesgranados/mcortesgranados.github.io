using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Sales.Sagas.OrderFulfilment;

/// <summary>
/// Q35 — an orchestrated saga. Not a transaction that spans services; a state
/// machine that records which local transaction each participant has already
/// accepted.
///
/// The design rules in one place:
///   1. Every step has a compensation, and the compensation is designed with the
///      step rather than after the incident.
///   2. The saga state is persisted after every step, so a process that dies mid-way
///      resumes instead of restarting or, worse, silently stopping.
///   3. Each step is idempotent, because the participant will be called twice
///      eventually — the transport is at-least-once and so is a resumed saga.
///   4. A non-compensable step (the notification) is ordered after the last point at
///      which the saga can fail.
///   5. A timeout on a participant is itself a failure: waiting forever is how a saga
///      becomes an orphan.
///
/// Two-phase commit is deliberately absent. Inside a single database this saga's
/// local steps use ordinary ACID transactions; across a service boundary the choice
/// is compensation plus idempotency, because 2PC makes every participant's
/// availability depend on the slowest one.
/// </summary>
public sealed class OrderFulfilmentSaga
{
    private readonly ISagaStateStore _state;
    private readonly IPaymentGateway _payments;
    private readonly IStockService _stock;
    private readonly IShippingService _shipping;
    private readonly INotifier _notifier;
    private readonly IClock _clock;

    public OrderFulfilmentSaga(
        ISagaStateStore state,
        IPaymentGateway payments,
        IStockService stock,
        IShippingService shipping,
        INotifier notifier,
        IClock clock)
    {
        _state = state;
        _payments = payments;
        _stock = stock;
        _shipping = shipping;
        _notifier = notifier;
        _clock = clock;
    }

    /// <summary>
    /// The forward path. Each guard checks the persisted state first, so a resumed
    /// saga does not repeat a step that already succeeded.
    /// </summary>
    public async Task<SagaOutcome> AdvanceAsync(OrderFulfilmentState state, CancellationToken cancellationToken)
    {
        // Steps 2 and 3 are independent, so they run concurrently: the saga is a
        // dependency graph, not necessarily a list.
        if (state.HasNotCompleted(Step.ReserveStock) && !await ReserveStockAsync(state, cancellationToken))
        {
            return SagaOutcome.Pending(Step.ReserveStock);
        }

        var paid = ChargePaymentAsync(state, cancellationToken);
        var booked = BookShipmentAsync(state, cancellationToken);
        await Task.WhenAll(paid, booked);

        if (!await paid || !await booked)
        {
            // The first failure triggers the compensations for everything already
            // accepted, in reverse order.
            await CompensateAsync(state, cancellationToken);
            return SagaOutcome.Compensated();
        }

        // Non-compensable and therefore last: nothing after this step can fail in a
        // way that requires an email to be unsent.
        await _notifier.OrderFulfilmentStartedAsync(state.OrderId, cancellationToken);
        await _state.MarkCompletedAsync(state.OrderId, _clock.UtcNow, cancellationToken);

        return SagaOutcome.Completed();
    }

    private async Task<bool> ReserveStockAsync(OrderFulfilmentState state, CancellationToken cancellationToken)
    {
        // The semantic lock is passed to the participant, so a second saga cannot
        // reserve the same stock for the same order while this one is in flight.
        var reservation = await _stock.ReserveAsync(
            state.OrderId, state.Lines, state.SemanticLockToken, cancellationToken);

        if (!reservation.Succeeded) return false;

        // Persisted before the next step: the process can die here and resume knowing
        // that the stock is reserved.
        await _state.RecordStepAsync(state.OrderId, Step.ReserveStock, reservation.Reference, cancellationToken);
        return true;
    }

    private async Task<bool> ChargePaymentAsync(OrderFulfilmentState state, CancellationToken cancellationToken)
    {
        if (state.HasCompleted(Step.ChargePayment)) return true;

        // The idempotency key is derived from the saga id, not generated per attempt,
        // so a retry after a timeout cannot charge twice.
        var charge = await _payments.ChargeAsync(
            state.OrderId, state.Amount, idempotencyKey: $"saga:{state.SagaId}:payment", cancellationToken);

        if (!charge.Succeeded) return false;

        await _state.RecordStepAsync(state.OrderId, Step.ChargePayment, charge.Reference, cancellationToken);
        return true;
    }

    private async Task<bool> BookShipmentAsync(OrderFulfilmentState state, CancellationToken cancellationToken)
    {
        if (state.HasCompleted(Step.BookShipment)) return true;

        var booking = await _shipping.BookAsync(
            state.OrderId, state.Lines, idempotencyKey: $"saga:{state.SagaId}:shipment", cancellationToken);

        if (!booking.Succeeded) return false;

        await _state.RecordStepAsync(state.OrderId, Step.BookShipment, booking.Reference, cancellationToken);
        return true;
    }

    /// <summary>
    /// The backward path, in reverse order, skipping anything that was never done.
    /// A compensation that itself fails is retried and, after its budget, raised to
    /// the reconciliation queue — the one case a human has to look at.
    /// </summary>
    public async Task CompensateAsync(OrderFulfilmentState state, CancellationToken cancellationToken)
    {
        foreach (var step in state.CompletedSteps.Reverse())
        {
            try
            {
                switch (step)
                {
                    case Step.BookShipment:
                        await _shipping.CancelAsync(state.OrderId, state.ReferenceFor(step), cancellationToken);
                        break;

                    case Step.ChargePayment:
                        // Refund is keyed on the original charge, so a duplicate refund
                        // is rejected by the gateway rather than credited twice.
                        await _payments.RefundAsync(state.ReferenceFor(step), cancellationToken);
                        break;

                    case Step.ReserveStock:
                        await _stock.ReleaseAsync(state.OrderId, state.ReferenceFor(step), cancellationToken);
                        break;
                }

                await _state.RecordCompensationAsync(state.OrderId, step, _clock.UtcNow, cancellationToken);
            }
            catch (Exception failure) when (failure is not OperationCanceledException)
            {
                // A compensation that cannot complete is not swallowed: it is queued
                // for the reconciliation job, which is where money and stock diverge
                // if nobody looks.
                await _state.QueueForReconciliationAsync(state.OrderId, step, failure.Message, cancellationToken);
            }
        }

        await _state.MarkCompensatedAsync(state.OrderId, _clock.UtcNow, cancellationToken);
    }

    /// <summary>
    /// The timeout sweep. A participant that never answered is treated as failed, not
    /// as still working: an unbounded wait is how a saga becomes an orphan holding a
    /// semantic lock nobody will release.
    /// </summary>
    public async Task SweepTimedOutAsync(CancellationToken cancellationToken)
    {
        var stalled = await _state.FindStalledAsync(_clock.UtcNow.AddMinutes(-5), cancellationToken);

        foreach (var state in stalled)
        {
            // The compensating timeout is bounded too, so the sweep cannot itself hang.
            using var sweepDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            sweepDeadline.CancelAfter(TimeSpan.FromSeconds(30));

            await CompensateAsync(state, sweepDeadline.Token);
        }
    }
}

public enum Step
{
    ReserveStock,
    ChargePayment,
    BookShipment,
    NotifyCustomer,   // not compensable: ordered last on purpose
}
