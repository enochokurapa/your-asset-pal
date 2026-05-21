
-- 1. DELETE policies (admin-only)
CREATE POLICY "admin delete assets" ON public.assets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete categories" ON public.categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete locations" ON public.locations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete branches" ON public.branches FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete assignments" ON public.asset_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete movements" ON public.asset_movements FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete disposals" ON public.asset_disposals FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete attachments" ON public.asset_attachments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete approvals" ON public.approval_requests FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete notifications" ON public.notifications FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "admin delete audit" ON public.audit_log FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete profiles" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete user_roles" ON public.user_roles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- 2. Per-user permission tables
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_permissions" ON public.user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_permissions" ON public.user_permissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE public.user_approval_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approval_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approval_kind)
);
ALTER TABLE public.user_approval_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_approval_rights" ON public.user_approval_rights FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_approval_rights" ON public.user_approval_rights FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3. Profile flags
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 4. Approval-notification trigger (was missing in db)
DROP TRIGGER IF EXISTS trg_approval_notify ON public.approval_requests;
CREATE TRIGGER trg_approval_notify
AFTER INSERT OR UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval();

-- 5. Audit triggers (re-attach so deletes/edits get logged)
DROP TRIGGER IF EXISTS trg_audit_assets ON public.assets;
CREATE TRIGGER trg_audit_assets AFTER INSERT OR UPDATE OR DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_categories ON public.categories;
CREATE TRIGGER trg_audit_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_locations ON public.locations;
CREATE TRIGGER trg_audit_locations AFTER INSERT OR UPDATE OR DELETE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_branches ON public.branches;
CREATE TRIGGER trg_audit_branches AFTER INSERT OR UPDATE OR DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_assignments ON public.asset_assignments;
CREATE TRIGGER trg_audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.asset_assignments FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_movements ON public.asset_movements;
CREATE TRIGGER trg_audit_movements AFTER INSERT OR UPDATE OR DELETE ON public.asset_movements FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_disposals ON public.asset_disposals;
CREATE TRIGGER trg_audit_disposals AFTER INSERT OR UPDATE OR DELETE ON public.asset_disposals FOR EACH ROW EXECUTE FUNCTION public.write_audit();
