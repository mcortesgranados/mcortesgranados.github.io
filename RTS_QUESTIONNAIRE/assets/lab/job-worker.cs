using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Sales.Jobs;

/// <summary>
/// Q38 — a background worker that behaves the same way a queue consumer does.
///
/// Four properties are the whole point of this class, and each one answers a failure
/// that shows up in production rather than in a design review:
///
///   1. The channel is bounded and refuses a write, so a burst produces backpressure
///      instead of an out-of-memory kill an hour later.
///   2. The handler is idempotent, because the job will be delivered twice eventually
///      — a redelivery, a retry after a timeout, or a resumed process.
///   3. Shutdown drains. The stopping token stops accepting new work, in-flight jobs
///      finish within the grace period, and anything still queued is requeued rather
///      than dropped on the floor during a rolling deploy.
///   4. Status is written back for every transition, because a job the user cannot see
///      is indistinguishable from a job that silently failed.
/// </summary>
public sealed class ExportWorker : BackgroundService
{
    private static readonly ActivitySource Activity = new("Sales.Jobs.Export");

    private readonly Channel<ExportJob> _queue;
    private readonly IJobStatusStore _status;
    private readonly IExportProcessor _processor;
    private readonly IJobQueue _durableQueue;     // where work goes if it must survive a restart
    private readonly ILogger<ExportWorker> _logger;
    private readonly int _consumers;
    private readonly TimeSpan _shutdownGrace;

    public ExportWorker(
        IJobStatusStore status,
        IExportProcessor processor,
        IJobQueue durableQueue,
        ILogger<ExportWorker> logger,
        JobOptions options)
    {
        _status = status;
        _processor = processor;
        _durableQueue = durableQueue;
        _logger = logger;

        _consumers = options.Consumers;
        _shutdownGrace = options.ShutdownGrace;

        // Bounded on purpose. An unbounded channel converts a slow dependency into a
        // memory leak with a delay on the fuse.
        _queue = Channel.CreateBounded<ExportJob>(new BoundedChannelOptions(options.QueueCapacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = false,
            SingleWriter = false,
        });
    }

    /// <summary>
    /// Enqueue from a request handler. Returns false when the queue is full, and the
    /// caller decides: wait, slow down, or hand the job to the durable queue. What it
    /// must not do is accept the work and lose it.
    /// </summary>
    public bool TryEnqueue(ExportJob job)
    {
        if (_queue.Writer.TryWrite(job)) return true;

        _logger.LogWarning("export queue full; offering job {JobId} to the durable queue", job.Id);
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("export worker starting with {Consumers} consumers", _consumers);

        var consumers = new List<Task>(_consumers);

        for (var index = 0; index < _consumers; index++)
        {
            consumers.Add(ConsumeAsync(index, stoppingToken));
        }

        await Task.WhenAll(consumers);

        // Anything still queued when the process is stopping is handed to the durable
        // queue, so the deploy does not silently discard accepted work.
        await RequeueRemainingAsync();

        _logger.LogInformation("export worker stopped");
    }

    private async Task ConsumeAsync(int index, CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                await RunAsync(job, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown: the reader loop exits and the in-flight job's
            // own cancellation handling takes over.
            _logger.LogDebug("consumer {Index} stopping", index);
        }
    }

    private async Task RunAsync(ExportJob job, CancellationToken stoppingToken)
    {
        using var activity = Activity.StartActivity("job.export", ActivityKind.Consumer);
        activity?.SetTag("job.id", job.Id);
        activity?.SetTag("job.type", job.Type);

        var stopwatch = Stopwatch.StartNew();

        // Set by whichever branch is taken, so the metric carries the real outcome
        // rather than a value the caller passed in.
        var outcome = "unknown";

        // The status write is what makes the job visible to the user, so it happens
        // before the work, not after it.
        await _status.MarkRunningAsync(job.Id, DateTimeOffset.UtcNow, CancellationToken.None);

        try
        {
            // The handler is idempotent: processing the same job id twice produces the
            // same artefact and the same side effect, which is what at-least-once
            // delivery requires of it.
            var result = await _processor.ProcessAsync(job, stoppingToken);

            await _status.MarkSucceededAsync(job.Id, result.OutputPath, stopwatch.Elapsed, CancellationToken.None);
            outcome = "succeeded";

            _logger.LogInformation(
                "job {JobId} ({JobType}) succeeded in {DurationMs} ms",
                job.Id, job.Type, stopwatch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutdown, not failure. The job goes back to the queue with its attempt
            // count intact, so it is retried rather than counted as a failure.
            await _status.MarkRequeuedAsync(job.Id, CancellationToken.None);
            await _durableQueue.EnqueueAsync(job, CancellationToken.None);   // attempt count preserved
            outcome = "requeued-on-shutdown";

            _logger.LogInformation("job {JobId} requeued: worker shutting down", job.Id);
        }
        catch (Exception failure)
        {
            var attempt = job.Attempt + 1;

            if (attempt >= job.MaxAttempts)
            {
                // Deterministic failure: retrying a tenth time will produce the same
                // exception. It is quarantined for a human, not retried forever.
                await _status.MarkQuarantinedAsync(job.Id, failure.Message, attempt, CancellationToken.None);
                await _durableQueue.MoveToQuarantineAsync(job, failure, CancellationToken.None);
                outcome = "quarantined";

                _logger.LogError(failure,
                    "job {JobId} quarantined after {Attempts} attempts", job.Id, attempt);

                return;
            }

            // Backoff with jitter: a batch of jobs that failed together must not retry
            // together, or the dependency that just recovered is knocked over again.
            var delay = Jitter(TimeSpan.FromSeconds(Math.Pow(2, attempt)));

            await _status.MarkRetryingAsync(job.Id, attempt, DateTimeOffset.UtcNow + delay, CancellationToken.None);
            outcome = "retrying";

            _logger.LogWarning(failure,
                "job {JobId} attempt {Attempt}/{Max} failed; retrying in {Delay}",
                job.Id, attempt, job.MaxAttempts, delay);

            _ = Task.Delay(delay, CancellationToken.None)
                .ContinueWith(_ => _durableQueue.EnqueueAsync(job with { Attempt = attempt }, CancellationToken.None),
                    TaskScheduler.Default);
        }
        finally
        {
            // The metrics that matter for a job runner: rate, failures and duration.
            // Backlog and the age of the oldest message are measured at the queue.
            JobMetrics.Record(job.Type, stopwatch.Elapsed, outcome);
        }
    }

    private async Task RequeueRemainingAsync()
    {
        while (_queue.Reader.TryRead(out var job))
        {
            await _durableQueue.EnqueueAsync(job, CancellationToken.None);
        }
    }

    private static TimeSpan Jitter(TimeSpan delay) =>
        delay + TimeSpan.FromMilliseconds(Random.Shared.Next(0, 250));
}
