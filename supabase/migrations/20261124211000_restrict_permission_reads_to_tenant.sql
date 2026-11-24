-- Add a restrictive SELECT policy to complement the existing restrictive write policies.
-- The existing tenant management helper preserves self access, tenant-admin access
-- to their own organisation, and authorised SaaS administrator operations.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['user_action_rights','user_approval_rights','user_branch_access','user_permissions','user_roles'] LOOP
  EXECUTE format('CREATE POLICY permission_read_tenant_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_tenant_user(auth.uid(),user_id))',t);
 END LOOP;
END $$;
COMMIT;
