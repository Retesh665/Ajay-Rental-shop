-- V19 audit history for non-ledger records. Run after V18 migration.
-- This migration does not change any rental charges, balances or existing transactions.
CREATE TABLE IF NOT EXISTS public.rd_audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  before_data jsonb,
  after_data jsonb,
  actor_id uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS rd_audit_history_time_idx ON public.rd_audit_history (occurred_at DESC);
ALTER TABLE public.rd_audit_history ENABLE ROW LEVEL SECURITY;
-- Mirrors the existing V18 test-only anonymous setup. Restrict before public deployment.
DROP POLICY IF EXISTS "V19 test audit read" ON public.rd_audit_history;
CREATE POLICY "V19 test audit read" ON public.rd_audit_history FOR SELECT TO anon, authenticated USING (true);
-- No client insert/update/delete policies: audit writes are performed by database triggers.
CREATE OR REPLACE FUNCTION public.rd_v19_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_json jsonb; new_json jsonb; entity uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN old_json := NULL; new_json := to_jsonb(NEW); entity := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN old_json := to_jsonb(OLD); new_json := NULL; entity := OLD.id;
  ELSE
    old_json := to_jsonb(OLD); new_json := to_jsonb(NEW); entity := NEW.id;
    IF old_json = new_json THEN RETURN NEW; END IF;
  END IF;
  -- Exclude raw customer photo/document URLs and other private fields from the audit snapshots.
  IF TG_TABLE_NAME = 'customers' THEN
    old_json := old_json - 'photo_url' - 'id_document_url';
    new_json := new_json - 'photo_url' - 'id_document_url';
  END IF;
  INSERT INTO public.rd_audit_history(entity_type, entity_id, action, details, before_data, after_data)
  VALUES (TG_TABLE_NAME, entity, TG_OP, TG_TABLE_NAME || ' ' || lower(TG_OP), old_json, new_json);
  RETURN COALESCE(NEW, OLD);
END $$;
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['customers','products','machines','machine_repairs','rd_notes'] LOOP
    IF to_regclass('public.' || tab) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS rd_v19_audit ON public.%I', tab);
      EXECUTE format('CREATE TRIGGER rd_v19_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rd_v19_audit_row()', tab);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON public.rd_audit_history FROM PUBLIC;
GRANT SELECT ON public.rd_audit_history TO anon, authenticated;
