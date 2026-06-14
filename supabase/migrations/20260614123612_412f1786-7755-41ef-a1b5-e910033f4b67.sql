
-- 1) approval_requests: prevent self-approval at the database level
DROP POLICY IF EXISTS "mgr update approvals" ON public.approval_requests;
CREATE POLICY "mgr update approvals" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) AND requested_by IS DISTINCT FROM auth.uid())
  WITH CHECK (public.is_admin_or_manager(auth.uid()) AND requested_by IS DISTINCT FROM auth.uid());

-- 2) asset_disposals: prevent the recorder from approving their own disposal
DROP POLICY IF EXISTS "mgr write disposals" ON public.asset_disposals;
CREATE POLICY "mgr write disposals" ON public.asset_disposals
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (
    public.is_admin_or_manager(auth.uid())
    AND (
      -- inserts and unrelated edits are fine
      status = 'pending'
      OR approved_by IS NULL
      -- when marking approved/rejected, approver must differ from recorder
      OR recorded_by IS NULL
      OR approved_by IS DISTINCT FROM recorded_by
    )
  );

-- 3) profiles: lock down SELECT so users only read their own row
--    Admins/managers can read every profile (needed for the admin UI and
--    the audit/depreciation lookups).
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "users read profiles" ON public.profiles;
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles select self" ON public.profiles;
DROP POLICY IF EXISTS "profiles select admin" ON public.profiles;

CREATE POLICY "profiles select self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles select admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- 4) user_roles: restrict SELECT (has_role() is SECURITY DEFINER so RLS still works)
DROP POLICY IF EXISTS "users read roles" ON public.user_roles;
DROP POLICY IF EXISTS "read roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select self" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select admin" ON public.user_roles;

CREATE POLICY "user_roles select self" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_roles select admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- 5) user_permissions / user_action_rights / user_approval_rights / user_branch_access:
--    own rows for staff, full read for admins/managers.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_permissions','user_action_rights','user_approval_rights','user_branch_access']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "users read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select all" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select_all" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select self" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select admin" ON public.%1$I', t);

    EXECUTE format($p$CREATE POLICY "%1$s select self" ON public.%1$I
      FOR SELECT TO authenticated USING (user_id = auth.uid())$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s select admin" ON public.%1$I
      FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()))$p$, t);
  END LOOP;
END $$;

-- 6) notifications: only allow inserts targeting yourself.
--    System notifications come from SECURITY DEFINER triggers (notify_on_approval,
--    enqueue_approval_reminders) which bypass RLS, so they keep working.
DROP POLICY IF EXISTS "self insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications insert" ON public.notifications;
CREATE POLICY "notifications insert self" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 7) Lock down SECURITY DEFINER helpers so anonymous role can't probe them.
--    Keep EXECUTE for authenticated where RLS policies/UI need them.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_do(uuid, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_approval_reminders()    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_do(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_approval_reminders()    TO service_role;
