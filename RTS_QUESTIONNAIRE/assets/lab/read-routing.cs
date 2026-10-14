using System;
using System.Data;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Sales.Data.ReadRouting;

/// <summary>
/// Q48 — sending a read to the right place.
///
/// Read replicas only help if the routing knows two things a connection string cannot
/// tell it: whether this particular read tolerates a stale answer, and what the
/// replication lag is right now. A replica that is thirty seconds behind is a fine
/// target for an analytics query and a broken one for a list the user just changed.
///
/// The three decisions encoded here:
///   1. Every read path declares its lag tolerance, so the choice is explicit rather
///      than "reads go to a replica".
///   2. A read that follows a write by the same user is pinned to the primary for a
///      short window, which is what makes read-after-write correct without making every
///      read a primary read.
///   3. If the replica exceeds its budget, the routing falls back to the primary and
///      raises a metric — degrading the database rather than the feature.
/// </summary>
public enum ReadPreference
{
    /// <summary>The list is decoration: a few seconds of lag is invisible.</summary>
    LagTolerant,

    /// <summary>The report is explicitly as-of: the lag is published with the result.</summary>
    AsOf,

    /// <summary>The user just wrote this. Route to the primary.</summary>
    ReadYourWrites,
}

public interface IReadRouter
{
    Task<IDbConnection> OpenAsync(ReadPreference preference, CancellationToken cancellationToken);
}

public sealed class ReadRouter : IReadRouter
{
    private readonly IConnectionFactory _primary;
    private readonly IReplicaPool _replicas;
    private readonly IRecentWriteTracker _recentWrites;
    private readonly IReadRoutingMetrics _metrics;
    private readonly ILogger<ReadRouter> _logger;
    private readonly TimeSpan _lagBudget = TimeSpan.FromSeconds(2);
    private readonly TimeSpan _pinAfterWrite = TimeSpan.FromSeconds(5);

    public ReadRouter(
        IConnectionFactory primary,
        IReplicaPool replicas,
        IRecentWriteTracker recentWrites,
        IReadRoutingMetrics metrics,
        ILogger<ReadRouter> logger)
    {
        _primary = primary;
        _replicas = replicas;
        _recentWrites = recentWrites;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<IDbConnection> OpenAsync(ReadPreference preference, CancellationToken cancellationToken)
    {
        // Rule 2: a read after the caller's own write never goes to a replica. The
        // window is short and per-session, so it costs a handful of primary reads rather
        // than all of them.
        if (preference is ReadPreference.ReadYourWrites || await _recentWrites.WroteRecentlyAsync(_pinAfterWrite, cancellationToken))
        {
            _metrics.Record(ReadPreference.ReadYourWrites, "primary-pinned");
            return await _primary.OpenAsync(cancellationToken);
        }

        if (preference is ReadPreference.AsOf)
        {
            // The report declares the replica position it read from, so a reader can see
            // how current the number is instead of guessing.
            var replica = await _replicas.SelectForAsOfAsync(cancellationToken);
            _metrics.Record(ReadPreference.AsOf, replica.Name);
            return await replica.OpenAsync(cancellationToken);
        }

        // Rule 3: a replica beyond its budget is not used. Serving a slightly slower
        // answer from the primary is better than serving a stale one and having the user
        // discover it, and this is the point at which the replica pool is scaled or the
        // lag is investigated.
        var candidate = await _replicas.SelectHealthiestAsync(cancellationToken);

        if (candidate.Lag > _lagBudget)
        {
            _logger.LogWarning(
                "replica {Replica} is {LagSeconds:F1}s behind (budget {BudgetSeconds}s): routing this read to the primary",
                candidate.Name, candidate.Lag.TotalSeconds, _lagBudget.TotalSeconds);

            _metrics.RecordLagBudgetExceeded(candidate.Name, candidate.Lag);
            return await _primary.OpenAsync(cancellationToken);
        }

        _metrics.Record(ReadPreference.LagTolerant, candidate.Name);
        return await candidate.OpenAsync(cancellationToken);
    }
}

/// <summary>
/// The decision, written down per endpoint, because it is the only way a reviewer can
/// check that a screen showing the user their own change is not reading a replica.
/// </summary>
public static class ReadRoutingDecisions
{
    public static readonly IReadOnlyDictionary<string, ReadPreference> ByEndpoint = new Dictionary<string, ReadPreference>
    {
        ["GET /orders/{id}"] = ReadPreference.ReadYourWrites,      // the user may have just confirmed it
        ["GET /orders/{id}/lines"] = ReadPreference.ReadYourWrites,
        ["GET /orders?customer="] = ReadPreference.LagTolerant,    // a list is decoration
        ["GET /reports/sales"] = ReadPreference.AsOf,              // the lag is published with the report
        ["GET /catalogue/**"] = ReadPreference.LagTolerant,
        ["GET /analytics/**"] = ReadPreference.AsOf,
    };
}

/// <summary>
/// The measurement that decides whether the ladder has been climbed far enough. Numbers
/// rather than opinions: the hit ratio says whether the cache is doing anything, the lag
/// says whether the replicas are usable, and the waits say where the database is
/// actually spending its time.
/// </summary>
public sealed class ScalingSignals
{
    public static void Publish(IScalingMetrics metrics, IReplicaPool replicas, ICacheStatistics caches)
    {
        // Replication lag per replica: the number that decides whether the replicas can
        // carry the read traffic at all.
        foreach (var replica in replicas.All())
        {
            metrics.Gauge("db.replication.lag_seconds", replica.Lag.TotalSeconds, new Tag("replica", replica.Name));
        }

        // Hit ratio per cache layer: an in-process cache with a 20% hit ratio is memory
        // held for nothing, and a cache whose ratio has fallen is usually an invalidation
        // change nobody announced.
        foreach (var layer in caches.Layers())
        {
            metrics.Gauge("cache.hit_ratio", layer.HitRatio, new Tag("layer", layer.Name), new Tag("cache", layer.Cache));
        }

        // The signals that identify the constraint before it is fixed.
        metrics.Gauge("db.connection_pool.saturation", PoolSaturation.Current());
        metrics.Counter("db.lock_waits", LockWaits.SinceLastReport());
        metrics.Histogram("db.query.duration_ms", QueryDurations.SinceLastReport());
    }
}
