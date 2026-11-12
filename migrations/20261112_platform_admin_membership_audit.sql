-- Platform administrator membership audit. Never expose direct writes to browser roles.
CREATE TABLE IF NOT EXISTS public.platform_admin_membership_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 target_user_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK (action IN ('promote','demote')),
 previous_state jsonb NOT NULL,
 new_state jsonb NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 15 AND 1000),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.platform_admin_membership_audit FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.platform_admin_membership_audit FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.platform_admin_membership_audit FROM authenticated;
 END IF;
END $$;
ALTER TABLE public.platform_admin_membership_audit ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS platform_admin_membership_audit_immutable ON public.platform_admin_membership_audit;
CREATE TRIGGER platform_admin_membership_audit_immutable
BEFORE UPDATE OR DELETE ON public.platform_admin_membership_audit
FOR EACH ROW EXECUTE FUNCTION public.reject_tenant_support_audit_mutation();

-- Index supporting efficient asset searches within the authorized business.
CREATE INDEX IF NOT EXISTS tenant_support_assets_lookup ON public.assets (tenant_id, updated_at DESC);
