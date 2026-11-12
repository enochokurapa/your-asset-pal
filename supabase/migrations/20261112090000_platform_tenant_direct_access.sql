-- Platform-owner intervention sessions: no customer approval is necessary.
-- Access is individually attributed, time-limited and never changes the tenant user's account.
CREATE TABLE IF NOT EXISTS public.platform_tenant_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  administrator_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 15 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'),
  ended_at timestamptz,
  CHECK(expires_at<=created_at+interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS platform_tenant_access_actor_idx ON public.platform_tenant_access_sessions(administrator_id,expires_at DESC);
CREATE TABLE IF NOT EXISTS public.platform_tenant_access_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.platform_tenant_access_sessions(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_tenant_access_audit_session_idx ON public.platform_tenant_access_audit(session_id,recorded_at DESC);
ALTER TABLE public.platform_tenant_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_tenant_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_tenant_access_sessions,public.platform_tenant_access_audit FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.platform_tenant_access_sessions,public.platform_tenant_access_audit FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.platform_tenant_access_sessions,public.platform_tenant_access_audit FROM authenticated;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.platform_tenant_access_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Platform tenant access audit is append-only'; END $$;
DROP TRIGGER IF EXISTS platform_tenant_access_audit_guard ON public.platform_tenant_access_audit;
CREATE TRIGGER platform_tenant_access_audit_guard BEFORE UPDATE OR DELETE
 ON public.platform_tenant_access_audit FOR EACH ROW
 EXECUTE FUNCTION public.platform_tenant_access_audit_immutable();
