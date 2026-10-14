-- ============================================================================
-- query-tuning.sql — how a slow screen is taken from a scan to a seek.
-- Written for SQL Server; the PostgreSQL equivalent is noted where it differs.
-- ============================================================================

-- 1. Measure before changing anything. Never tune from intuition.
SET STATISTICS IO, TIME ON;

-- 2. The original query: non-sargable predicate kills the index.
SELECT o.Id, o.CreatedAt, o.Total
FROM Orders o
WHERE YEAR(o.CreatedAt) = 2026          -- function on a column: forces a scan
  AND o.Status = 'Open'
ORDER BY o.CreatedAt DESC;

-- Logical reads 8,412 ... Scan (IX_Orders_CreatedAt) ... 1,240 ms

-- 3. Rewrite it so the optimiser can use the index range.
DECLARE @from date = '2026-01-01';
DECLARE @to   date = '2027-01-01';

SELECT o.Id, o.CreatedAt, o.Total
FROM Orders o
WHERE o.CreatedAt >= @from               -- sargable range instead of YEAR()
  AND o.CreatedAt <  @to
  AND o.Status = 'Open'
ORDER BY o.CreatedAt DESC;

-- 4. Cover the query: key order follows the predicates, INCLUDE removes lookups.
CREATE NONCLUSTERED INDEX IX_Orders_Status_CreatedAt
    ON Orders (Status, CreatedAt DESC)
    INCLUDE (CustomerId, Total)
    WITH (FILLFACTOR = 90, ONLINE = ON);

-- Logical reads 8,412 -> 24 ... Index Seek ... 3 ms

-- 5. Keep the estimates honest; stale statistics are the usual cause of
--    a hash join appearing where a nested loop was cheaper.
UPDATE STATISTICS Orders WITH FULLSCAN;

-- PostgreSQL equivalent of the same steps:
--   EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
--   CREATE INDEX CONCURRENTLY ix_orders_status_created_at ON orders (status, created_at DESC) INCLUDE (total);
--   ANALYZE orders;   -- and autovacuum keeps it current afterwards

-- 6. Verify the write side too: an extra index is a cost on every INSERT.
SELECT index_id, index_type_desc, avg_fragmentation_in_percent
FROM sys.dm_db_index_physical_stats(DB_ID(), OBJECT_ID('Orders'), NULL, NULL, 'SAMPLED')
WHERE avg_fragmentation_in_percent > 10;

-- 7. Readers should not block writers on reporting screens.
ALTER DATABASE App SET READ_COMMITTED_SNAPSHOT ON;

-- 8. Wrap a multi-statement business operation in one explicit transaction,
--    with optimistic concurrency on the rows the user actually changes.
BEGIN TRAN;

    UPDATE Orders
    SET Status = 'Closed'
    WHERE Id = 42
      AND RowVersion = @expectedRowVersion;   -- 0 rows updated = someone else won

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK TRAN;
        THROW 51000, 'Concurrency conflict: the order changed while you were editing it.', 1;
    END

COMMIT TRAN;
