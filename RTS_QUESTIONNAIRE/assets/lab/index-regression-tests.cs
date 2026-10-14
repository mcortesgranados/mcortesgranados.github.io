using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Sales.Database.Tests;

/// <summary>
/// Q47 — the execution-plan assertions that keep the physical model honest.
///
/// "Every index decision is validated with a plan rather than with intuition" is a
/// sentence until it is enforced. This file enforces it: the hot queries are asserted
/// to seek, the index set is asserted to have no orphan, and a new index cannot be
/// added without the before-and-after plan recorded in the migration.
///
/// These tests run against a containerised engine seeded with a representative volume,
/// because a plan taken against an empty table is a different plan: the optimiser picks
/// a scan for ten rows and a seek for ten million, and a test that does not seed will
/// pass while production does not.
/// </summary>
[Collection("database")]
public sealed class PhysicalModelTests
{
    private readonly DatabaseFixture _database;

    public PhysicalModelTests(DatabaseFixture database) => _database = database;

    /// <summary>
    /// Every query in the inventory that is expected to seek. If the optimiser stops
    /// choosing a seek, an index was dropped, the order of its columns changed, or the
    /// statistics went stale — all three are regressions that otherwise appear as a
    /// latency incident in production.
    /// </summary>
    [Theory]
    [MemberData(nameof(HotQueries))]
    public async Task HotQuerySeeksRatherThanScans(string queryKey, string sql, object parameters)
    {
        var plan = await _database.CapturePlanAsync(sql, parameters, CancellationToken.None);

        Assert.DoesNotContain("Table Scan", plan.Xml);
        Assert.DoesNotContain("Clustered Index Scan", plan.Xml);
        Assert.Contains(plan.IndexesUsed, index => plan.Xml.Contains(index, StringComparison.Ordinal));
        Assert.True(plan.LogicalReads < 200,
            $"{queryKey} read {plan.LogicalReads} pages: the plan is no longer answering from the index.");
    }

    /// <summary>
    /// An index nobody reads is a write cost on every insert. Four weeks is long enough
    /// to cover a monthly job and short enough that a mistake is not permanent.
    /// </summary>
    [Fact]
    public async Task EveryIndexHasAReader()
    {
        var unused = await _database.QueryAsync<IndexUsage>(
            """
            SELECT i.name AS IndexName, ISNULL(us.user_seeks, 0) + ISNULL(us.user_lookups, 0) AS Reads
            FROM   sys.indexes i
                   LEFT JOIN sys.dm_db_index_usage_stats us
                          ON us.object_id = i.object_id AND us.index_id = i.index_id
            WHERE  i.object_id = OBJECT_ID('dbo.Orders') AND i.type > 0
            """);

        // The primary key is exempt: it is the table, not an index added for a query.
        var orphans = unused
            .Where(index => index.Reads == 0 && !index.IndexName.StartsWith("PK_", StringComparison.Ordinal))
            .Select(index => index.IndexName)
            .ToArray();

        Assert.True(orphans.Length == 0,
            $"These indexes have served no read: {string.Join(", ", orphans)}. Remove them or document why they stay.");
    }

    /// <summary>
    /// The query inventory and the index set are two views of the same decision, so a
    /// query with no index and an index with no query are both failures.
    /// </summary>
    [Fact]
    public async Task TheQueryInventoryAndTheIndexSetAgree()
    {
        var inventory = await _database.QueryAsync<QueryInventoryRow>(
            "SELECT QueryKey, TargetIndex, TargetPlan FROM dbo.QueryInventory");

        var indexes = (await _database.QueryAsync<string>(
            "SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Orders') AND type > 0")).ToArray();

        foreach (var entry in inventory)
        {
            if (entry.TargetPlan == "scan-justified")
            {
                // A scan is allowed — a reporting aggregate over the whole month is
                // cheaper as a scan than as ten thousand seeks — but it must be a
                // decision somebody recorded, not an accident.
                continue;
            }

            Assert.False(string.IsNullOrEmpty(entry.TargetIndex),
                $"{entry.QueryKey} expects a seek but names no index.");

            Assert.Contains(entry.TargetIndex, indexes);
        }
    }

    /// <summary>
    /// The partition boundary job is the kind of task that fails quietly and is noticed
    /// a month later, when the purge deletes data that belonged to the wrong month.
    /// </summary>
    [Fact]
    public async Task TheNextPartitionBoundariesExist()
    {
        var boundaries = await _database.QueryAsync<DateTime>(
            """
            SELECT CAST(value AS datetime2) AS Boundary
            FROM   sys.partition_range_values AS prv
                   JOIN sys.partition_functions AS pf ON pf.function_id = prv.function_id
            WHERE  pf.name = 'pf_OrderDate'
            ORDER  BY boundary_id
            """);

        var lastBoundary = boundaries.LastOrDefault();
        var neededUntil = DateTime.UtcNow.AddMonths(2);

        Assert.True(lastBoundary > neededUntil,
            $"The last partition boundary is {lastBoundary:yyyy-MM-dd}: the next two months would land in the previous partition.");
    }

    /// <summary>
    /// An index added at the same time as a feature is the normal case, and the plan is
    /// what proves it was needed. The migration carries the plan as a comment; this test
    /// is what makes that requirement fail rather than be remembered.
    /// </summary>
    [Fact]
    public void EveryIndexMigrationRecordsAPlan()
    {
        var migrations = MigrationScripts.All()
            .Where(script => script.Sql.Contains("CREATE NONCLUSTERED INDEX", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        var undocumented = migrations
            .Where(script => !script.Sql.Contains("-- plan before:", StringComparison.OrdinalIgnoreCase)
                          || !script.Sql.Contains("-- plan after:", StringComparison.OrdinalIgnoreCase))
            .Select(script => script.Name)
            .ToArray();

        Assert.True(undocumented.Length == 0,
            $"{undocumented.Length} index migrations ship without the before-and-after plan: {string.Join(", ", undocumented)}");
    }

    public static IEnumerable<object[]> HotQueries() => new[]
    {
        new object[]
        {
            "order-history",
            "SELECT OrderNumber, Status, TotalAmount FROM dbo.Orders WHERE TenantId = @t AND CustomerId = @c AND OrderDate >= @from ORDER BY PlacedAt DESC",
            new { t = 42, c = Guid.Empty, from = "2026-01-01" },
        },
        new object[]
        {
            "operations-queue",
            "SELECT OrderNumber, PlacedAt FROM dbo.Orders WHERE TenantId = @t AND OrderDate >= @from AND Status = 2",
            new { t = 42, from = "2026-10-01" },
        },
        new object[]
        {
            "order-by-number",
            "SELECT OrderId FROM dbo.Orders WHERE TenantId = @t AND OrderNumber = @n",
            new { t = 42, n = "ORD-2026-000042" },
        },
    };
}

public sealed record IndexUsage(string IndexName, long Reads);
public sealed record QueryInventoryRow(string QueryKey, string? TargetIndex, string TargetPlan);
public sealed record MigrationScript(string Name, string Sql);

public sealed record QueryPlan(string Xml, long LogicalReads, IReadOnlyCollection<string> IndexesUsed);
