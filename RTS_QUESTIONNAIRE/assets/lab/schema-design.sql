-- Q47 — the physical model for the orders schema.
--
-- Written as DDL because that is the artefact that actually ships, and annotated
-- because the reasoning is the part that gets lost. Every index below names the query
-- it exists to serve; an index without a named query is a write cost with no reader.
-- Every constraint is here rather than in application code because a constraint is the
-- only check that survives two concurrent requests arriving at the same instant.
--
-- Engine: SQL Server (the equivalents for PostgreSQL and Oracle are noted where the
-- mechanism genuinely differs).

-- ---------------------------------------------------------------------------
-- Partition scheme: range by month, so archiving is a metadata switch.
-- ---------------------------------------------------------------------------

CREATE PARTITION FUNCTION pf_OrderDate (date)
    AS RANGE RIGHT FOR VALUES (
        '2024-01-01', '2024-02-01', '2024-03-01'   -- one boundary per month, added ahead of time
        -- the job that adds next month's boundary runs on the 25th, so a month never
        -- runs out of partitions: a missing boundary silently routes a month into the
        -- previous one and the purge then deletes the wrong data
    );

CREATE PARTITION SCHEME ps_OrderDate
    AS PARTITION pf_OrderDate ALL TO ([PRIMARY]);

-- ---------------------------------------------------------------------------
-- The table.
-- ---------------------------------------------------------------------------

CREATE TABLE dbo.Orders
(
    OrderId          uniqueidentifier  NOT NULL CONSTRAINT DF_Orders_Id DEFAULT NEWSEQUENTIALID(),
    TenantId         int               NOT NULL,
    OrderNumber      varchar(24)       NOT NULL,
    CustomerId       uniqueidentifier  NOT NULL,
    Status           tinyint           NOT NULL,   -- enum in code, tinyint in storage: no strings in hot rows
    Currency         char(3)           NOT NULL,
    -- Money as decimal, never float: a float total is an audit finding waiting to happen.
    TotalAmount      decimal(19, 4)    NOT NULL,
    PlacedAt         datetime2(3)      NOT NULL,
    ConfirmedAt      datetime2(3)      NULL,
    CancelledAt      datetime2(3)      NULL,
    RowVersion       rowversion        NOT NULL,   -- optimistic concurrency, used by every update
    OrderDate        AS (CONVERT(date, PlacedAt)) PERSISTED,   -- the partition key, derived not maintained

    CONSTRAINT PK_Orders                       PRIMARY KEY CLUSTERED (OrderDate, OrderId),
    -- The cluster key includes the partition key, which is required, and the surrogate
    -- id keeps a stable reference for other tables and for clients.
    CONSTRAINT UQ_Orders_TenantOrderNumber     UNIQUE (TenantId, OrderNumber),
    -- The natural key: the duplicate is impossible rather than unlikely. This is what
    -- makes a retried create safe without the application having to be perfect.
    CONSTRAINT FK_Orders_Customers             FOREIGN KEY (CustomerId) REFERENCES dbo.Customers (CustomerId),
    CONSTRAINT CK_Orders_TotalAmount_Positive  CHECK (TotalAmount >= 0),
    -- The invariant that an order cannot be confirmed after it was cancelled lives in
    -- the domain, but the impossible combination is also refused here.
    CONSTRAINT CK_Orders_StatusDates           CHECK (
        (Status = 1 AND ConfirmedAt IS NULL AND CancelledAt IS NULL) OR
        (Status = 2 AND ConfirmedAt IS NOT NULL AND CancelledAt IS NULL) OR
        (Status = 3 AND CancelledAt IS NOT NULL)),
    CONSTRAINT CK_Orders_Currency              CHECK (Currency IN ('USD', 'EUR', 'COP', 'MXN'))
)
ON ps_OrderDate (OrderDate);

-- ---------------------------------------------------------------------------
-- Indexes, each with the query it serves.
--
-- The order of the columns follows the predicates: equality first, then the range.
-- A composite index in the wrong order is a scan with extra steps.
-- ---------------------------------------------------------------------------

-- Serves: the order history screen.
--   WHERE TenantId = @t AND CustomerId = @c AND OrderDate >= @from ORDER BY PlacedAt DESC
-- Equality (TenantId, CustomerId) then the range delivered by the cluster key.
CREATE NONCLUSTERED INDEX IX_Orders_Tenant_Customer_PlacedAt
    ON dbo.Orders (TenantId, CustomerId, PlacedAt DESC)
    INCLUDE (OrderNumber, Status, TotalAmount, Currency)   -- covering: the screen needs nothing else
    ON ps_OrderDate (OrderDate);

-- Serves: the operations queue and the dashboard tile.
--   WHERE TenantId = @t AND OrderDate >= @from AND Status = 2
-- Filtered: status 2 is the hot 4% of rows, and the index is that fraction of the size.
CREATE NONCLUSTERED INDEX IX_Orders_Tenant_Confirmed
    ON dbo.Orders (TenantId, PlacedAt)
    INCLUDE (OrderNumber, TotalAmount)
    WHERE Status = 2
    ON ps_OrderDate (OrderDate);

-- Serves: the reconciliation job.
--   WHERE OrderDate = @day AND CancelledAt IS NOT NULL
-- The sparse predicate is filtered so the reconciler does not read the whole day.
CREATE NONCLUSTERED INDEX IX_Orders_Date_Cancelled
    ON dbo.Orders (OrderDate, CancelledAt)
    WHERE CancelledAt IS NOT NULL
    ON ps_OrderDate (OrderDate);

-- Serves: nothing, and therefore removed.
-- CREATE INDEX IX_Orders_CustomerId ON dbo.Orders (CustomerId);
--   Superseded by IX_Orders_Tenant_Customer_PlacedAt, whose leading columns cover it.
--   It was found by the unused-index report after four weeks with a read count of zero,
--   while still costing a write on every insert.
--
-- Serves: the refund path, which reads the confirmed order by its client-facing id.
--   WHERE TenantId = @t AND OrderNumber = @n
-- UQ_Orders_TenantOrderNumber already covers this: no second index needed.

-- ---------------------------------------------------------------------------
-- The query inventory, which is what the indexes above are derived from.
--
-- Kept as a table rather than a document, so it can be joined against the index usage
-- statistics and a query with no index, or an index with no query, both become visible.
-- ---------------------------------------------------------------------------

CREATE TABLE dbo.QueryInventory
(
    QueryKey        varchar(64)   NOT NULL PRIMARY KEY,
    Purpose         varchar(200)  NOT NULL,
    Predicates      varchar(400)  NOT NULL,   -- the real predicate shape, not a paraphrase
    CallsPerHour    int           NOT NULL,   -- frequency decides whether an index is worth its write cost
    TargetIndex     varchar(128)  NULL,       -- null means: this query is doing a scan on purpose
    TargetPlan      varchar(64)   NOT NULL,   -- seek, scan-with-partition-elimination, or scan-justified
    LastReviewedAt  datetime2(3)  NOT NULL WITH DEFAULT SYSUTCDATETIME()
);

-- ---------------------------------------------------------------------------
-- The triage, as a query rather than as intuition.
--
-- The habit that matters: an index decision is made from the plan and from the reads
-- and writes, never from the shape of the WHERE clause alone.
-- ---------------------------------------------------------------------------

-- 1. What is expensive right now.
SELECT TOP (20)
       qs.total_elapsed_time / qs.execution_count AS avg_elapsed_us,
       qs.execution_count,
       qs.total_logical_reads / qs.execution_count AS avg_logical_reads,
       SUBSTRING(st.text, (qs.statement_start_offset / 2) + 1,
           ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
             ELSE qs.statement_end_offset END - qs.statement_start_offset) / 2) + 1) AS statement_text,
       qp.query_plan
FROM   sys.dm_exec_query_stats AS qs
       CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
       CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) AS qp
WHERE  qs.execution_count > 10
ORDER  BY avg_logical_reads DESC;

-- 2. Which indexes are paying for themselves, and which are not.
SELECT i.name,
       ISNULL(us.user_seeks, 0)   AS seeks,
       ISNULL(us.user_scans, 0)   AS scans,
       ISNULL(us.user_lookups, 0) AS lookups,
       ISNULL(us.user_updates, 0) AS writes_paid,
       -- The ratio that justifies the index: if writes dwarf reads, the index is a cost.
       CAST(ISNULL(us.user_seeks, 0) + ISNULL(us.user_lookups, 0) AS decimal(10, 2))
           / NULLIF(ISNULL(us.user_updates, 0), 0) AS read_to_write_ratio
FROM   sys.indexes AS i
       LEFT JOIN sys.dm_db_index_usage_stats AS us
              ON us.object_id = i.object_id AND us.index_id = i.index_id
WHERE  i.object_id = OBJECT_ID('dbo.Orders')
       AND i.type > 0
ORDER  BY writes_paid DESC;

-- 3. Fragmentation, so the maintenance job is driven by a measurement rather than a schedule.
SELECT i.name,
       ps.avg_fragmentation_in_percent,
       ps.page_count
FROM   sys.dm_db_index_physical_stats(DB_ID(), OBJECT_ID('dbo.Orders'), NULL, NULL, 'SAMPLED') AS ps
       JOIN sys.indexes AS i ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE  ps.page_count > 1000            -- below a thousand pages, rebuild is a waste of a window
       AND ps.avg_fragmentation_in_percent > 30
ORDER  BY ps.avg_fragmentation_in_percent DESC;
