-- RentDesk V19.17: one active Supabase Auth session per staff user.
-- Apply AFTER migrations 001..011. BACK UP database first.
-- The active session is the most recent successfully registered login.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rd_active_staff_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rd_active_staff_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rd_active_staff_sessions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rd_register_staff_session()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Staff login required' USING ERRCODE='28000'; END IF;
  sid := nullif(auth.jwt()->>'session_id','')::uuid;
  IF sid IS NULL THEN RAISE EXCEPTION 'Auth session identifier missing' USING ERRCODE='28000'; END IF;
  INSERT INTO public.rd_active_staff_sessions(user_id,session_id,activated_at)
  VALUES(auth.uid(),sid,clock_timestamp())
  ON CONFLICT(user_id) DO UPDATE SET session_id=EXCLUDED.session_id,activated_at=EXCLUDED.activated_at;
END $$;

CREATE OR REPLACE FUNCTION public.rd_staff_session_valid()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rd_active_staff_sessions s
    WHERE s.user_id=auth.uid()
      AND s.session_id=nullif(auth.jwt()->>'session_id','')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.rd_end_staff_session()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.rd_active_staff_sessions
  WHERE user_id=auth.uid() AND session_id=nullif(auth.jwt()->>'session_id','')::uuid;
$$;
REVOKE ALL ON FUNCTION public.rd_register_staff_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rd_staff_session_valid() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rd_end_staff_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rd_register_staff_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rd_staff_session_valid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rd_end_staff_session() TO authenticated;

-- Enforce the active session for ALL ordinary PostgREST table access.
-- Existing permissive policies remain; this RESTRICTIVE policy adds an AND guard.
-- For previously unprotected tables, preserve authenticated staff access but close anonymous access.
DO $$
DECLARE r record; had_rls boolean;
BEGIN
 FOR r IN SELECT c.oid,c.relname,c.relrowsecurity FROM pg_class c
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p')
            AND c.relname <> 'rd_active_staff_sessions'
 LOOP
   had_rls:=r.relrowsecurity;
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname);
   IF NOT had_rls THEN
     EXECUTE format('CREATE POLICY rd_staff_base_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',r.relname);
   END IF;
   EXECUTE format('CREATE POLICY rd_one_active_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.rd_staff_session_valid()) WITH CHECK (public.rd_staff_session_valid())',r.relname);
   -- Anonymous access should not be used by the staff app.
   EXECUTE format('REVOKE ALL ON public.%I FROM anon',r.relname);
 END LOOP;
END $$;

-- Views must obey caller RLS, not silently bypass it as their owner.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='v'
 LOOP
   EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)',r.relname);
   EXECUTE format('REVOKE ALL ON public.%I FROM anon',r.relname);
 END LOOP;
END $$;

-- Remove test-only anonymous EXECUTE permissions introduced by older migrations.
REVOKE EXECUTE ON FUNCTION public.rd_change_machine_status(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.rd_complete_machine_repair(uuid,numeric,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.next_rental_display_id() FROM PUBLIC,anon;
-- Rental ID generation also uses SECURITY DEFINER; deny replaced sessions.
CREATE OR REPLACE FUNCTION public.next_rental_display_id()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n bigint; prefix_index bigint; serial_no bigint; first_letter int; second_letter int;
BEGIN
 IF NOT public.rd_staff_session_valid() THEN RAISE EXCEPTION 'Session replaced by another login' USING ERRCODE='28000'; END IF;
 n := nextval('public.rental_display_seq');
 prefix_index := (n-1)/9999;
 serial_no := ((n-1)%9999)+1;
 IF prefix_index >= 676 THEN RAISE EXCEPTION 'Rental display ID sequence exhausted'; END IF;
 first_letter := prefix_index/26;
 second_letter := prefix_index%26;
 RETURN chr(65+first_letter)||chr(65+second_letter)||'-'||lpad(serial_no::text,4,'0');
END $$;
-- SECURITY DEFINER status functions bypass table RLS: explicitly guard their entry.
CREATE OR REPLACE FUNCTION public.rd_change_machine_status(p_machine_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text;
BEGIN
 IF NOT public.rd_staff_session_valid() THEN RAISE EXCEPTION 'Session replaced by another login' USING ERRCODE='28000'; END IF;
 IF p_status NOT IN ('available','repair','dismantled') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 SELECT status INTO v_status FROM public.machines WHERE id=p_machine_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
 IF v_status='rented' THEN RAISE EXCEPTION 'Return the rented machine first'; END IF;
 IF v_status='repair' AND p_status='available' THEN RAISE EXCEPTION 'Use Repair Done to complete repair'; END IF;
 IF v_status='repair' AND p_status='dismantled' THEN RAISE EXCEPTION 'Complete repair before dismantling'; END IF;
 UPDATE public.machines SET status=p_status WHERE id=p_machine_id;
END $$;
CREATE OR REPLACE FUNCTION public.rd_complete_machine_repair(p_machine_id uuid,p_cost numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_start timestamptz;
BEGIN
 IF NOT public.rd_staff_session_valid() THEN RAISE EXCEPTION 'Session replaced by another login' USING ERRCODE='28000'; END IF;
 IF p_cost IS NULL OR p_cost < 0 OR nullif(btrim(p_notes),'') IS NULL THEN RAISE EXCEPTION 'Repair cost and note are required'; END IF;
 SELECT status INTO v_status FROM public.machines WHERE id=p_machine_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
 IF v_status <> 'repair' THEN RAISE EXCEPTION 'Machine is not under repair'; END IF;
 SELECT started_at INTO v_start FROM public.machine_status_history
 WHERE machine_id=p_machine_id AND status='repair' ORDER BY started_at DESC LIMIT 1;
 UPDATE public.machine_repairs SET status='completed',completed_at=now(),notes=concat_ws(E'\n',nullif(notes,''),p_notes)
 WHERE machine_id=p_machine_id AND status='open';
 INSERT INTO public.machine_repairs(machine_id,problem,cost,notes,status,started_at,completed_at,created_by)
 VALUES(p_machine_id,'Repair completed',p_cost,p_notes,'completed',coalesce(v_start,now()),now(),auth.uid());
 UPDATE public.machines SET status='available' WHERE id=p_machine_id;
END $$;
COMMIT;
