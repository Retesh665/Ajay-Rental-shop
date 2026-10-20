-- V17: restore least-privilege execution permissions after earlier test GRANTs.
-- Keep Supabase Auth in place. Never expose these SECURITY DEFINER functions to anon/PUBLIC.
BEGIN;
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON FUNCTION public.rd_change_machine_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rd_complete_machine_repair(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rd_change_machine_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rd_complete_machine_repair(uuid,numeric,text) TO authenticated;
COMMIT;
