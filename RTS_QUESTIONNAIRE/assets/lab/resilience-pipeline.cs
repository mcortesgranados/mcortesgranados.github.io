using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Polly.Timeout;

namespace Sales.Resilience;

/// <summary>
/// Q34 — the resilience pipeline around every outbound call.
///
/// The order of the strategies is the design, not a detail. Timeout is outermost so
/// the whole call is bounded; the bulkhead sits inside it so one dependency cannot
/// consume every worker; retry is inside the bulkhead because a retry that has to
/// queue for a limiter it already holds would deadlock; the breaker is innermost, so
/// it observes the attempt rather than the retry loop and cannot trip on a single
/// request's exhausted budget.
///
/// What this type deliberately does not do is coordinate a transaction across
/// services. Compensating actions, sagas and two-phase commit are the subject of
/// Q35; here the goal is bounded, observable failure.
/// </summary>
public static class ResiliencePipelines
{
    public static ResiliencePipeline<HttpResponseMessage> ForPayments(ILogger logger) =>
        new ResiliencePipelineBuilder<HttpResponseMessage>()
            // 1. Bound the whole call. Without this, a slow dependency becomes
            //    thread-pool exhaustion in the caller.
            .AddTimeout(new TimeoutStrategyOptions
            {
                Timeout = TimeSpan.FromSeconds(3),
                OnTimeout = args =>
                {
                    logger.LogWarning("payments call timed out after {Timeout}", args.Timeout);
                    return default;
                },
            })
            // 2. Cap concurrency so the payments outage does not consume every
            //    worker in this service. The queue above the limit is deliberately
            //    small: shedding load early beats accumulating a backlog.
            .AddConcurrencyLimiter(new ConcurrencyLimiterOptions
            {
                PermitLimit = 32,
                QueueLimit = 8,
            })
            // 3. Retry only what is retryable, with exponential backoff and jitter,
            //    so a fleet that failed together does not retry together.
            .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
            {
                MaxRetryAttempts = 2,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
                Delay = TimeSpan.FromMilliseconds(200),
                ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                    .Handle<HttpRequestException>()
                    .Handle<TimeoutRejectedException>()
                    .HandleResult(response => (int)response.StatusCode >= 500),
                OnRetry = args =>
                {
                    logger.LogInformation(
                        "payments attempt {Attempt} failed, retrying in {Delay}",
                        args.AttemptNumber, args.RetryDelay);
                    return default;
                },
            })
            // 4. Shed load while the dependency is genuinely down, instead of
            //    spending the retry budget on calls that cannot succeed.
            .AddCircuitBreaker(new CircuitBreakerStrategyOptions<HttpResponseMessage>
            {
                FailureRatio = 0.5,
                MinimumThroughput = 20,
                SamplingDuration = TimeSpan.FromSeconds(30),
                BreakDuration = TimeSpan.FromSeconds(15),
                OnOpened = args =>
                {
                    logger.LogError("payments circuit opened for {Duration}", args.BreakDuration);
                    return default;
                },
                OnClosed = args =>
                {
                    logger.LogInformation("payments circuit closed");
                    return default;
                },
            })
            .Build();

    /// <summary>
    /// Every handler registered here is safe to run twice, because at-least-once
    /// delivery is a property of the transport and not something a consumer can
    /// negotiate away. The dedup key is the message id, and the check and the side
    /// effect share one local transaction.
    /// </summary>
    public static ResiliencePipeline<HttpResponseMessage> ForQueueConsumers() =>
        new ResiliencePipelineBuilder<HttpResponseMessage>()
            .AddTimeout(TimeSpan.FromSeconds(10))
            // No retry here on purpose: the queue already redelivers. A retry inside
            // a redelivering consumer multiplies attempts instead of adding
            // resilience, and it is how a poison message becomes an outage.
            .Build();
}

/// <summary>
/// The idempotent-consumer skeleton. The inbox row and the business change are
/// written in the same local transaction, so "already processed" is decided by the
/// database rather than by timing.
/// </summary>
public sealed class OrderEventsConsumer
{
    private readonly IInbox _inbox;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEventDispatcher _dispatcher;
    private readonly ILogger<OrderEventsConsumer> _logger;

    public OrderEventsConsumer(
        IInbox inbox,
        IUnitOfWork unitOfWork,
        IEventDispatcher dispatcher,
        ILogger<OrderEventsConsumer> logger)
    {
        _inbox = inbox;
        _unitOfWork = unitOfWork;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public async Task ConsumeAsync(OrderEventEnvelope envelope, CancellationToken cancellationToken)
    {
        // Duplicate delivery is expected, not exceptional.
        if (await _inbox.AlreadyProcessedAsync(envelope.MessageId, cancellationToken))
        {
            _logger.LogDebug("message {MessageId} already processed, acking", envelope.MessageId);
            return;
        }

        // Out-of-order delivery is also expected: the envelope carries the stream
        // position, so a stale message is skipped rather than applied backwards.
        if (await _inbox.IsStaleAsync(envelope.AggregateId, envelope.Version, cancellationToken))
        {
            _logger.LogWarning("skipping stale message {MessageId} at version {Version}",
                envelope.MessageId, envelope.Version);
            return;
        }

        try
        {
            await _dispatcher.HandleAsync(envelope.Payload, cancellationToken);
            _inbox.MarkProcessed(envelope.MessageId, envelope.AggregateId, envelope.Version);

            // One local commit: the dedup row and the change land together, which is
            // what makes a redelivery after a crash a no-op instead of a duplicate.
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch (Exception failure) when (failure is not OperationCanceledException)
        {
            // Nothing is marked as processed, so the transport redelivers. After the
            // transport's own attempt budget, the message goes to the dead-letter
            // queue with the failure attached rather than blocking the partition.
            _logger.LogError(failure, "handling {MessageId} failed; leaving unacked for redelivery",
                envelope.MessageId);
            throw;
        }
    }
}
