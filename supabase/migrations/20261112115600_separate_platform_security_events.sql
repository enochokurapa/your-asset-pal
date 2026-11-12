-- Security-sensitive staff and tenant configuration changes are retained
-- separately from the dedicated asset-change audit.
CREATE TABLE IF NOT EXISTS public.platform_tenant_security_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.platform_tenant_access_sessions(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 recorded_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_tenant_security_events_session
 ON public.platform_tenant_security_events(session_id,recorded_at DESC);
ALTER TABLE public.platform_tenant_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_tenant_security_events FROM PUBLIC;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.platform_tenant_security_events FROM authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.platform_tenant_security_events FROM anon;
 END IF;
END$$;
DROP TRIGGER IF EXISTS platform_tenant_security_events_immutable
 ON public.platform_tenant_security_events;
CREATE TRIGGER platform_tenant_security_events_immutable
 BEFORE UPDATE OR DELETE ON public.platform_tenant_security_events
 FOR EACH ROW EXECUTE FUNCTION public.platform_tenant_access_audit_immutable();
