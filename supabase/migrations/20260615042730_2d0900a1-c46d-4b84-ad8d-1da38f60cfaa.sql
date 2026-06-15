
CREATE SEQUENCE IF NOT EXISTS public.gate_pass_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.gate_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_number text UNIQUE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  destination text NOT NULL,
  expected_return_date date NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','checked_out','returned','cancelled')),
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_reason text,
  checked_out_at timestamptz,
  checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  returned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  return_condition text,
  return_notes text,
  previous_asset_status public.asset_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gate_passes_asset_idx ON public.gate_passes(asset_id);
CREATE INDEX IF NOT EXISTS gate_passes_branch_idx ON public.gate_passes(branch_id);
CREATE INDEX IF NOT EXISTS gate_passes_status_idx ON public.gate_passes(status);
CREATE INDEX IF NOT EXISTS gate_passes_requested_by_idx ON public.gate_passes(requested_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gate_passes TO authenticated;
GRANT ALL ON public.gate_passes TO service_role;
GRANT USAGE ON SEQUENCE public.gate_pass_number_seq TO authenticated, service_role;

ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read gate_passes" ON public.gate_passes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "self insert gate_passes" ON public.gate_passes FOR INSERT
  TO authenticated WITH CHECK (requested_by = auth.uid());

CREATE POLICY "approver/owner update gate_passes" ON public.gate_passes FOR UPDATE
  TO authenticated USING (
    public.is_admin_or_manager(auth.uid())
    OR public.has_role(auth.uid(), 'security'::public.app_role)
    OR public.can_do(auth.uid(), 'approve_gate_pass')
    OR public.can_do(auth.uid(), 'verify_gate_pass')
    OR requested_by = auth.uid()
  );

CREATE POLICY "admin delete gate_passes" ON public.gate_passes FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.assign_gate_pass_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IN ('approved','checked_out')) AND NEW.pass_number IS NULL THEN
    NEW.pass_number := 'GP-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.gate_pass_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gate_pass_number ON public.gate_passes;
CREATE TRIGGER trg_gate_pass_number BEFORE INSERT OR UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.assign_gate_pass_number();

DROP TRIGGER IF EXISTS trg_gate_passes_touch ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_touch BEFORE UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_gate_passes_audit ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_audit AFTER INSERT OR UPDATE OR DELETE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();

CREATE OR REPLACE FUNCTION public.notify_on_gate_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF tg_op = 'INSERT' THEN
    FOR r IN
      SELECT user_id FROM public.user_roles
      WHERE role IN ('admin','manager','security')
      UNION
      SELECT user_id FROM public.user_action_rights
      WHERE action_kind IN ('approve_gate_pass','verify_gate_pass')
    LOOP
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      VALUES (r.user_id, 'gate_pass_requested', 'New gate pass request',
              'A new gate pass is awaiting approval.',
              'gate_passes', NEW.id, true, true);
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (NEW.requested_by, 'gate_pass_' || NEW.status,
            'Your gate pass was ' || NEW.status,
            COALESCE('Pass: ' || NEW.pass_number, 'Status changed'),
            'gate_passes', NEW.id, false, true);
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.notify_on_gate_pass() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_on_gate_pass() TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_gate_pass_number() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_gate_passes_notify ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_notify AFTER INSERT OR UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_gate_pass();
