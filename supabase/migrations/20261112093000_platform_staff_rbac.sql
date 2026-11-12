-- Platform staffing roles remain separate from business user_roles and from is_saas_admin.
-- Permissions are deliberately allowlisted and never inherit platform-owner powers.
CREATE TABLE IF NOT EXISTS public.platform_staff_memberships (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('finance','support','operations','viewer')),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_staff_role_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 target_id uuid NOT NULL REFERENCES public.profiles(id),
 event text NOT NULL CHECK(event IN ('staff_created','role_assigned','role_removed','staff_disabled')),
 prior_role text,
 new_role text,
 reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_staff_audit_date_idx ON public.platform_staff_role_audit(recorded_at DESC);
ALTER TABLE public.platform_staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_staff_role_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_staff_memberships, public.platform_staff_role_audit FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.platform_staff_memberships,public.platform_staff_role_audit FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.platform_staff_memberships,public.platform_staff_role_audit FROM authenticated;
 END IF;
END $$;
DROP TRIGGER IF EXISTS platform_staff_role_audit_immutable ON public.platform_staff_role_audit;
CREATE TRIGGER platform_staff_role_audit_immutable BEFORE UPDATE OR DELETE
 ON public.platform_staff_role_audit FOR EACH ROW EXECUTE FUNCTION public.platform_tenant_access_audit_immutable();

-- Read-only, caller-bound role lookup for the login experience.
CREATE OR REPLACE FUNCTION public.my_platform_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN p.is_saas_admin THEN 'saas_admin' ELSE m.role END
 FROM public.profiles p LEFT JOIN public.platform_staff_memberships m ON m.user_id=p.id
 WHERE p.id=auth.uid() AND p.is_active=TRUE
$$;
REVOKE ALL ON FUNCTION public.my_platform_staff_role() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_platform_staff_role() TO authenticated;
