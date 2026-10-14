using System;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Sales.Transactions;

/// <summary>
/// Q36 — the local ACID boundary, which is the half of the answer that is often
/// skipped in favour of the distributed half.
///
/// Three rules are applied here, and the third is the one that is usually missing:
///   1. One use case, one commit. The transaction is only opened explicitly when the
///      work spans multiple statements or aggregates.
///   2. The isolation level is chosen for the invariant being protected, and the
///      reason is written down next to the choice.
///   3. A guard in code is not a guarantee: the unique constraint and the row version
///      are what actually hold when two requests arrive at the same instant.
///
/// Nothing in this class calls another service. A network call inside a transaction
/// is how a lock ends up held for the duration of somebody else's timeout.
/// </summary>
public sealed class ReserveStockUseCase
{
    private readonly SalesDbContext _context;
    private readonly IClock _clock;

    public ReserveStockUseCase(SalesDbContext context, IClock clock)
    {
        _context = context;
        _clock = clock;
    }

    /// <summary>
    /// The common case: one aggregate, one table set, no explicit transaction.
    /// <c>SaveChangesAsync</c> is already atomic, so wrapping it in a manual
    /// transaction would add a round trip and hold locks marginally longer for no
    /// gain in guarantee.
    /// </summary>
    public async Task<Result> HandleAsync(ReserveStock command, CancellationToken cancellationToken = default)
    {
        var stock = await _context.Stocks
            .FirstOrDefaultAsync(item => item.Sku == command.Sku, cancellationToken);

        if (stock is null) return Result.NotFound(command.Sku);

        // The domain method is where the invariant lives: it refuses to go negative.
        var reservation = stock.Reserve(command.Quantity, command.OrderId, _clock.UtcNow);

        if (!reservation.Succeeded) return Result.Invalid(reservation.Reason);

        try
        {
            // One commit. Optimistic concurrency means a concurrent reservation of the
            // same row raises DbUpdateConcurrencyException rather than overselling,
            // which is the correct failure: the caller retries against fresh data.
            await _context.SaveChangesAsync(cancellationToken);
            return Result.Ok();
        }
        catch (DbUpdateConcurrencyException)
        {
            // Not a bug and not a reason to escalate: two buyers reached the last unit
            // at the same time. The retry is at the message level, where it belongs.
            return Result.Conflict("Stock changed while the reservation was being made.");
        }
    }

    /// <summary>
    /// The case that does need an explicit transaction: two aggregates written
    /// together, where a partial application would break a business rule.
    ///
    /// <c>Snapshot</c> is chosen deliberately. Under read committed, a long read while
    /// another transaction is updating the same rows takes shared locks and blocks
    /// writers; the snapshot keeps the read stable without blocking them, at the cost
    /// of version-store growth and the possibility of a write conflict on commit.
    /// </summary>
    public async Task<Result> TransferAsync(TransferStock command, CancellationToken cancellationToken = default)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(
            IsolationLevel.Snapshot, cancellationToken);

        try
        {
            var from = await _context.Stocks.FirstAsync(item => item.Sku == command.FromSku, cancellationToken);
            var to = await _context.Stocks.FirstAsync(item => item.Sku == command.ToSku, cancellationToken);

            var withdrawn = from.Withdraw(command.Quantity, command.OrderId, _clock.UtcNow);
            if (!withdrawn.Succeeded) return Result.Invalid(withdrawn.Reason);

            to.Deposit(command.Quantity, command.OrderId, _clock.UtcNow);

            // The outbox row joins this transaction, so the event describing the move
            // cannot be published for a move that rolled back. That single detail is
            // what removes the need for a distributed transaction later.
            _context.Outbox.Add(OutboxEntry.From(withdrawn.Event));

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Result.Ok();
        }
        catch (Exception failure) when (failure is not OperationCanceledException)
        {
            // Explicit, although the provider would roll back on dispose: the intent is
            // part of the code, not an implicit consequence of leaving a using block.
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }
}

/// <summary>
/// The retry policy for the cases that genuinely contend. Serializable isolation is
/// only chosen where an invariant spans rows — an allocation that must not exceed a
/// quota, for example — and it comes with the retry that its failure mode requires.
/// </summary>
public static class TransactionRetry
{
    /// <summary>
    /// Deadlock victim (1205) and snapshot write conflict (3960) are both expected
    /// outcomes under contention, not defects. Jitter matters: without it, the two
    /// transactions that just collided will collide again on the same schedule.
    /// </summary>
    public static async Task<T> OnConflictAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        int maxAttempts = 3,
        CancellationToken cancellationToken = default)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await operation(cancellationToken);
            }
            catch (Exception failure) when (IsTransient(failure) && attempt < maxAttempts)
            {
                var backoff = TimeSpan.FromMilliseconds(
                    25 * Math.Pow(2, attempt) + Random.Shared.Next(0, 25));

                await Task.Delay(backoff, cancellationToken);
            }
        }
    }

    private static bool IsTransient(Exception failure) => failure switch
    {
        DbUpdateConcurrencyException => true,
        // SqlException numbers for deadlock victim and snapshot conflict.
        Microsoft.Data.SqlClient.SqlException sql => sql.Number is 1205 or 3960,
        _ => false,
    };
}
