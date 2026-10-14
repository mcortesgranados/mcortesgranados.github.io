// Q42 — pseudocode for an algorithm that is hard to get right.
//
// Part of the low-level design deliverable: the algorithm is written at this level of
// detail *before* implementation, because the parts that go wrong are the tie-break and
// the retry, not the loop. Writing it here costs an hour and a design review; discovering
// it in production costs a stock count that does not reconcile.
//
// Algorithm: allocate an order's lines across warehouses.
//
// Invariants, stated first because they are what the review has to check:
//   I1  The sum of allocations equals the requested quantity, or the whole allocation fails.
//       There is no partial success: a half-allocated order is worse than a rejected one.
//   I2  No warehouse is allocated below zero available units, at any point in time.
//   I3  The same idempotency key produces the same allocation, always, including after a retry.
//   I4  The order of evaluation is deterministic: ties are broken by warehouse code, never by
//       enumeration order. Without this, two runs with the same input can differ, and I3 is
//       unachievable.
//   I5  Allocation is all-or-nothing at the database level: either every reservation row is
//       committed or none is.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Sales.Allocation;

/// <summary>
/// Pseudocode for review, not final code. The shape of the algorithm is the deliverable:
/// the counter subtraction is optimistic with a conditional update, the loop is
/// deterministic, and the failure path releases nothing because nothing was committed.
/// </summary>
public sealed class AllocateStockHandler
{
    private readonly IWarehouseReadStore _read;      // availability, read without a lock
    private readonly IReservationWriteStore _write;  // conditional reservations
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public AllocateStockHandler(
        IWarehouseReadStore read,
        IReservationWriteStore write,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _read = read;
        _write = write;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<AllocationResult> HandleAsync(AllocateStock command, CancellationToken cancellationToken)
    {
        // STEP 1 — idempotency by lookup, not by prevention. The unique constraint on
        // (OrderId, IdempotencyKey) is the real guarantee; this lookup is an optimisation
        // that avoids doing the work twice in the common retry case. Getting the order
        // wrong here would be invisible in the happy path.
        var existing = await _write.FindAllocationAsync(command.OrderId, command.IdempotencyKey, cancellationToken);
        if (existing is not null)
        {
            return AllocationResult.Replay(existing);        // I3
        }

        // STEP 2 — read availability once, outside the transaction. These numbers are a
        // hint, not a promise: another request may take the units between this read and the
        // conditional write below, which is exactly why the write is conditional.
        var warehouses = await _read.AvailableAsync(command.Sku, cancellationToken);

        // I4 — deterministic order. Primary key: available units descending, so the
        // allocation consumes the least fragmented warehouse first. Tie-break: warehouse
        // code ascending, so two identical inputs never produce different outputs.
        var ordered = warehouses
            .OrderByDescending(warehouse => warehouse.Available)
            .ThenBy(warehouse => warehouse.Code, StringComparer.Ordinal)
            .ToArray();

        var plan = Plan(command.Quantity, ordered);

        // I1 — all or nothing. A plan that cannot satisfy the request is refused here,
        // before anything is written, rather than discovered halfway through.
        if (plan.TotalAllocated < command.Quantity)
        {
            return AllocationResult.Insufficient(
                requested: command.Quantity,
                available: plan.TotalAllocated,
                shortfall: command.Quantity - plan.TotalAllocated);
        }

        // STEP 3 — one transaction, and the conditional updates inside it.
        await _unitOfWork.BeginAsync(cancellationToken);

        foreach (var allocation in plan.Allocations)
        {
            // I2 — the conditional update is the guard. It decrements only if there are
            // still enough units, so the check and the decrement cannot be separated by
            // another request. A read-then-write here would be a lost update under load.
            var taken = await _write.TryReserveAsync(
                allocation.WarehouseCode,
                command.Sku,
                allocation.Quantity,
                new ReservationStamp(command.OrderId, command.IdempotencyKey, _clock.UtcNow),
                cancellationToken);

            if (!taken)
            {
                // I5 — roll back everything. Nothing was committed, so nothing has to be
                // released, which is the difference between a rollback and a compensation.
                await _unitOfWork.RollbackAsync(cancellationToken);
                return AllocationResult.Contended(allocation.WarehouseCode);
            }
        }

        await _unitOfWork.CommitAsync(cancellationToken);    // one commit, one outcome

        return AllocationResult.Allocated(plan.Allocations);
    }

    /// <summary>
    /// The planning step, pure and therefore trivially testable: given the ordered
    /// warehouses and the quantity, produce the allocation or the shortfall.
    ///
    /// This is the part worth writing in pseudocode. The greedy fill is correct because
    /// I1 makes partial satisfaction useless: taking units from the warehouse with most
    /// available reduces the chance of leaving an unusable remainder elsewhere.
    /// </summary>
    internal static AllocationPlan Plan(int quantity, IReadOnlyList<WarehouseAvailability> ordered)
    {
        var remaining = quantity;
        var allocations = new List<Allocation>(ordered.Count);

        foreach (var warehouse in ordered)
        {
            if (remaining == 0) break;

            var take = Math.Min(remaining, warehouse.Available);
            if (take <= 0) continue;

            allocations.Add(new Allocation(warehouse.Code, take));
            remaining -= take;
        }

        return new AllocationPlan(allocations, quantity - remaining);
    }
}

// ---------------------------------------------------------------------------------------
// The cases the review has to walk through, written down with the invariant each one tests.
//
//   no stock at all                  -> Insufficient, nothing written      (I1)
//   exactly enough in one warehouse  -> Allocated, one reservation        (I1, I5)
//   enough spread over three         -> Allocated in deterministic order  (I4)
//   one unit short                   -> Insufficient, nothing written      (I1)
//   another request takes the last
//     unit between the read and the
//     conditional write              -> Contended, rolled back              (I2, I5)
//   the client retries the same key  -> Replay of the same allocation      (I3)
//   the client retries with a
//     different quantity, same key   -> refused: the key is bound to the request, not to
//                                       the order, and reusing it differently is a client bug
//
// The last line is the one that gets designed away if it is not written down: "same key,
// different body" is a defect in the caller, and answering it with a second allocation
// would silently double the reservation.
// ---------------------------------------------------------------------------------------
