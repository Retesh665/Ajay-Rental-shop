-- TEST DATABASE ONLY. Allows anonymous callers to change machine status.
-- DO NOT APPLY TO PRODUCTION OR A PUBLICLY EXPOSED DATABASE.
-- Run after 007_v17_staff_rpc_permissions.sql.
-- Keeps rented-machine guard, repair cost/note validation, and atomic repair completion.
BEGIN;
CREATE OR REPLACE FUNCTION public.rd_complete_machine_repair(p_machine_id uuid,p_cost numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_start timestamptz;
BEGIN
 IF p_cost IS NULL OR p_cost < 0 OR nullif(btrim(p_notes),'') IS NULL THEN
  RAISE EXCEPTION 'Repair cost and note are required';
 END IF;
 SELECT status INTO v_status FROM public.machines WHERE id=p_machine_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
 IF v_status <> 'repair' THEN RAISE EXCEPTION 'Machine is not under repair'; END IF;
 SELECT started_at INTO v_start FROM public.machine_status_history
 WHERE machine_id=p_machine_id AND status='repair' ORDER BY started_at DESC LIMIT 1;
 UPDATE public.machine_repairs SET status='completed',completed_at=now(),
 notes=concat_ws(E'\n',nullif(notes,''),p_notes)
 WHERE machine_id=p_machine_id AND status='open';
 INSERT INTO public.machine_repairs(machine_id,problem,cost,notes,status,started_at,completed_at,created_by)
 VALUES(p_machine_id,'Repair completed',p_cost,p_notes,'completed',coalesce(v_start,now()),now(),auth.uid());
 UPDATE public.machines SET status='available' WHERE id=p_machine_id;
END $$;
CREATE OR REPLACE FUNCTION public.rd_change_machine_status(p_machine_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text;
BEGIN
 IF p_status NOT IN ('available','repair','dismantled') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 SELECT status INTO v_status FROM public.machines WHERE id=p_machine_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
 IF v_status='rented' THEN RAISE EXCEPTION 'Return the rented machine first'; END IF;
 IF v_status='repair' AND p_status='available' THEN RAISE EXCEPTION 'Use Repair Done to complete repair'; END IF;
 IF v_status='repair' AND p_status='dismantled' THEN RAISE EXCEPTION 'Complete repair before dismantling'; END IF;
 UPDATE public.machines SET status=p_status WHERE id=p_machine_id;
END $$;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rd_change_machine_status(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rd_complete_machine_repair(uuid,numeric,text) TO anon,authenticated;
COMMIT;
