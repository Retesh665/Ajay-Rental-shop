-- Read-only diagnostics. Run in Supabase SQL Editor against the intended project.
-- Do not paste user records, tokens or secrets into issue reports.
SELECT schemaname, relname AS table_name, n_live_tup AS estimated_rows,
       seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('customers','rental_orders','rental_items','machines',
                    'transactions','events','rental_item_segments')
ORDER BY tablename, indexname;

SELECT schemaname, relname AS table_name, indexrelname AS index_name,
       idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- If pg_stat_statements is installed and available to your role, separately
-- inspect slow statements in Supabase Query Performance dashboard.
-- EXPLAIN ANALYZE executes queries: use staging, and never run it on a
-- destructive INSERT/UPDATE/DELETE without a protective rollback.
