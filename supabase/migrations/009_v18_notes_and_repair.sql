-- V18. Run after 008 on a DISPOSABLE TEST database only.
-- The existing 008 anonymous status RPCs are unsafe for production; this migration does not broaden their permissions.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rd_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '',
 is_checklist boolean NOT NULL DEFAULT false,
 items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items)='array'),
 pinned boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.rd_touch_note() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS rd_notes_touch ON public.rd_notes;
CREATE TRIGGER rd_notes_touch BEFORE UPDATE ON public.rd_notes FOR EACH ROW EXECUTE FUNCTION public.rd_touch_note();
ALTER TABLE public.rd_notes ENABLE ROW LEVEL SECURITY;
-- Test-only policies: app has no authenticated staff session. Never use for production.
DROP POLICY IF EXISTS "V18 test notes read" ON public.rd_notes;
CREATE POLICY "V18 test notes read" ON public.rd_notes FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "V18 test notes insert" ON public.rd_notes;
CREATE POLICY "V18 test notes insert" ON public.rd_notes FOR INSERT TO anon,authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "V18 test notes update" ON public.rd_notes;
CREATE POLICY "V18 test notes update" ON public.rd_notes FOR UPDATE TO anon,authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "V18 test notes delete" ON public.rd_notes;
CREATE POLICY "V18 test notes delete" ON public.rd_notes FOR DELETE TO anon,authenticated USING (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.rd_notes TO anon,authenticated;
-- Read access required for machine profile and report when using V17 test-only anonymous mode.
DROP POLICY IF EXISTS "V18 test repairs read" ON public.machine_repairs;
CREATE POLICY "V18 test repairs read" ON public.machine_repairs FOR SELECT TO anon USING (true);
GRANT SELECT ON public.machine_repairs TO anon;
DROP POLICY IF EXISTS "V18 test status history read" ON public.machine_status_history;
CREATE POLICY "V18 test status history read" ON public.machine_status_history FOR SELECT TO anon USING (true);
GRANT SELECT ON public.machine_status_history TO anon;
-- Keep exactly one repair record for each repair completion, with its entered cost and note.
-- Corrects test instances where an open record was updated AND an additional completed record inserted.
CREATE OR REPLACE FUNCTION public.rd_complete_machine_repair(p_machine_id uuid,p_cost numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_start timestamptz; v_open uuid;
BEGIN
 IF p_cost IS NULL OR p_cost<0 OR nullif(btrim(p_notes),'') IS NULL THEN RAISE EXCEPTION 'Repair cost and note are required'; END IF;
 SELECT status INTO v_status FROM public.machines WHERE id=p_machine_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
 IF v_status<>'repair' THEN RAISE EXCEPTION 'Machine is not under repair'; END IF;
 SELECT started_at INTO v_start FROM public.machine_status_history WHERE machine_id=p_machine_id AND status='repair' ORDER BY started_at DESC LIMIT 1;
 SELECT id INTO v_open FROM public.machine_repairs WHERE machine_id=p_machine_id AND status='open' ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
 IF v_open IS NOT NULL THEN
   UPDATE public.machine_repairs SET status='completed',cost=p_cost,notes=p_notes,completed_at=now() WHERE id=v_open;
 ELSE
   INSERT INTO public.machine_repairs(machine_id,problem,cost,notes,status,started_at,completed_at,created_by)
   VALUES(p_machine_id,'Repair completed',p_cost,p_notes,'completed',coalesce(v_start,now()),now(),auth.uid());
 END IF;
 UPDATE public.machines SET status='available' WHERE id=p_machine_id;
END $$;
COMMIT;
