-- Combined production migration. Transactional deploy via existing migration pipeline.
-- Time-bound, approved tenant support. Apply with the normal production migration process.
CREATE TABLE IF NOT EXISTS public.tenant_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  administrator_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 15 AND 1000),
  scope text NOT NULL CHECK (scope IN ('diagnostics_read', 'operational_support')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','denied','revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK ((state <> 'approved') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND expires_at IS NOT NULL)),
  CHECK (expires_at IS NULL OR expires_at <= approved_at + interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS tenant_support_by_tenant ON public.tenant_support_sessions(tenant_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS tenant_support_by_admin ON public.tenant_support_sessions(administrator_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_support_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  support_session_id uuid NOT NULL REFERENCES public.tenant_support_sessions(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_support_audit_session ON public.tenant_support_audit(support_session_id, recorded_at DESC);

-- The application uses trusted server-side PostgreSQL with explicit actor validation.
-- These tables must NOT become accessible through a client-side PostgREST role.
REVOKE ALL ON public.tenant_support_sessions FROM PUBLIC;
REVOKE ALL ON public.tenant_support_audit FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.tenant_support_sessions, public.tenant_support_audit FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.tenant_support_sessions, public.tenant_support_audit FROM authenticated;
 END IF;
END $$;
ALTER TABLE public.tenant_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_support_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reject_tenant_support_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Tenant support audit records are append-only';
END $$;
DROP TRIGGER IF EXISTS tenant_support_audit_immutable ON public.tenant_support_audit;
CREATE TRIGGER tenant_support_audit_immutable
BEFORE UPDATE OR DELETE ON public.tenant_support_audit
FOR EACH ROW EXECUTE FUNCTION public.reject_tenant_support_audit_mutation();


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
