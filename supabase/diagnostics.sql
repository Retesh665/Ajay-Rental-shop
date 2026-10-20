-- Read-only database health checklist. Run in Supabase SQL Editor.
select to_regclass('public.rd_active_staff_sessions') as single_session_table;
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('customers','machines','products','rental_orders','rental_items','events','transactions') order by table_name;
select tablename, indexname from pg_indexes where schemaname='public' and tablename in ('customers','machines','rental_orders','rental_items','transactions') order by tablename,indexname;
select relname, n_live_tup, n_dead_tup, last_autoanalyze from pg_stat_user_tables where schemaname='public' order by n_dead_tup desc;
select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename, policyname;
