-- Read-only index/size review. Run in Supabase SQL Editor; do not blindly add indexes.
SELECT schemaname, relname AS table_name, seq_scan, idx_scan, n_live_tup, n_dead_tup
FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY seq_scan DESC LIMIT 30;

SELECT schemaname, relname AS table_name, indexrelname AS index_name, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes WHERE schemaname = 'public' ORDER BY idx_scan DESC LIMIT 50;

-- For a slow query, run EXPLAIN (ANALYZE, BUFFERS) on a SELECT
-- in a test environment. Do not EXPLAIN ANALYZE financial writes in production.
