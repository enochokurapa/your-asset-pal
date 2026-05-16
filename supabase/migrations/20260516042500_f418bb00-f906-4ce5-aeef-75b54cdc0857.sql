
-- 1. Rename status enum value lost -> missing
ALTER TYPE asset_status RENAME VALUE 'lost' TO 'missing';

-- 2. Assets: new columns
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS set_for_disposal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_status asset_status;

-- 3. is_active on categories & locations
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.locations  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 4. Replace combined ALL policies with split insert/update so DELETE is blocked.
DROP POLICY IF EXISTS "mgr write categories" ON public.categories;
DROP POLICY IF EXISTS "mgr insert categories" ON public.categories;
DROP POLICY IF EXISTS "mgr update categories" ON public.categories;
CREATE POLICY "mgr insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "mgr update categories" ON public.categories FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "mgr write locations" ON public.locations;
DROP POLICY IF EXISTS "mgr insert locations" ON public.locations;
DROP POLICY IF EXISTS "mgr update locations" ON public.locations;
CREATE POLICY "mgr insert locations" ON public.locations FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "mgr update locations" ON public.locations FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "admin delete assets" ON public.assets;

-- 5. Audit log cleared flag
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleared_by uuid;

DROP POLICY IF EXISTS "admin update audit" ON public.audit_log;
CREATE POLICY "admin update audit" ON public.audit_log FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  requires_action boolean NOT NULL DEFAULT false,
  action_status text NOT NULL DEFAULT 'pending',
  beep boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "mgr insert notifications" ON public.notifications;
CREATE POLICY "users read own notifications"   ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mgr insert notifications"       ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- 7. approval_requests
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  asset_id uuid,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  approver_id uuid,
  decided_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_status ON public.approval_requests(status, kind);
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read approvals" ON public.approval_requests;
DROP POLICY IF EXISTS "auth insert approvals" ON public.approval_requests;
DROP POLICY IF EXISTS "mgr update approvals" ON public.approval_requests;
CREATE POLICY "auth read approvals"   ON public.approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert approvals" ON public.approval_requests FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());
CREATE POLICY "mgr update approvals"  ON public.approval_requests FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

-- 8. asset_imports log
CREATE TABLE IF NOT EXISTS public.asset_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  total_rows int NOT NULL DEFAULT 0,
  success_rows int NOT NULL DEFAULT 0,
  error_rows int NOT NULL DEFAULT 0,
  errors jsonb,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read imports" ON public.asset_imports;
DROP POLICY IF EXISTS "mgr write imports" ON public.asset_imports;
CREATE POLICY "auth read imports" ON public.asset_imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write imports" ON public.asset_imports FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));

-- 9. Notify trigger
CREATE OR REPLACE FUNCTION public.notify_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_beep boolean;
BEGIN
  IF tg_op = 'INSERT' THEN
    v_beep := (new.kind IN ('retirement','disposal','reactivation','set_for_disposal'));
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager') LOOP
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      VALUES (r.user_id, 'approval_requested', 'Approval needed: ' || new.kind,
              'A new ' || new.kind || ' request is pending approval.',
              'approval_requests', new.id, true, v_beep);
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (new.requested_by, 'approval_decided',
            'Your ' || new.kind || ' request was ' || new.status,
            coalesce(new.reason, ''), 'approval_requests', new.id, false, false);
  END IF;
  RETURN coalesce(new, old);
END; $$;

DROP TRIGGER IF EXISTS trg_notify_approval ON public.approval_requests;
CREATE TRIGGER trg_notify_approval
  AFTER INSERT OR UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval();

-- 10. Audit trigger on approvals
DROP TRIGGER IF EXISTS trg_audit_approvals ON public.approval_requests;
CREATE TRIGGER trg_audit_approvals AFTER INSERT OR UPDATE OR DELETE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();

-- 11. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_requests;
