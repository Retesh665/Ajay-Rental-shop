-- Read-only diagnostics. Run in Supabase SQL Editor; no schema changes.
select schemaname, relname as table_name, indexrelname as index_name, idx_scan
from pg_stat_user_indexes where schemaname = 'public' order by relname, idx_scan desc;

select relname as table_name, seq_scan, idx_scan, n_live_tup, n_dead_tup
from pg_stat_user_tables where schemaname = 'public' order by n_live_tup desc;

-- Use EXPLAIN (ANALYZE, BUFFERS) on your actual slow SELECT statements in staging.
-- Do not blindly add indexes: the 011 migration already covers many hot paths.
