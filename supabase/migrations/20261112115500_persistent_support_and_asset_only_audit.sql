-- A platform-owned business session stays valid until the administrator explicitly exits
-- or their platform account loses authorization. The normal login/MFA session still applies.
ALTER TABLE public.platform_tenant_access_sessions
  DROP CONSTRAINT IF EXISTS platform_tenant_access_sessions_check;
ALTER TABLE public.platform_tenant_access_sessions
  ALTER COLUMN expires_at DROP NOT NULL,
  ALTER COLUMN expires_at DROP DEFAULT;

-- Preserve old, historical access events, but keep future support CHANGE audit
-- focused on actual customer asset mutations.
CREATE OR REPLACE FUNCTION public.current_platform_support_session_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE hdr jsonb; raw_id text; support_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NULL; END IF;
 BEGIN
  hdr:=COALESCE(NULLIF(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  raw_id:=hdr->>'x-assetflow-support-session';
  IF raw_id IS NULL OR raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  support_id:=raw_id::uuid;
 EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
 RETURN (
  SELECT s.id FROM public.platform_tenant_access_sessions s
  JOIN public.profiles p ON p.id=s.administrator_id
  WHERE s.id=support_id AND s.administrator_id=auth.uid()
    AND p.is_saas_admin=TRUE AND p.is_active=TRUE
    AND s.ended_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>NOW())
  LIMIT 1
 );
END $$;

CREATE OR REPLACE FUNCTION public.audit_platform_support_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid;
BEGIN
 -- The dedicated change audit should be limited to actual modifications
 -- of assets by the active SaaS Admin, never dashboard views or navigation.
 IF NEW.entity_type <> 'assets' OR NEW.action NOT IN ('created','updated','deleted','retired') THEN
  RETURN NEW;
 END IF;
 s:=public.current_platform_support_session_id();
 IF s IS NOT NULL AND NEW.actor_user_id=auth.uid()
    AND NEW.tenant_id=public.current_platform_support_tenant_id() THEN
   INSERT INTO public.platform_tenant_access_audit
    (session_id,tenant_id,actor_id,action,details)
   VALUES (s,NEW.tenant_id,auth.uid(),'asset_'||NEW.action,
    jsonb_build_object('entityId',NEW.entity_id,'auditId',NEW.id,'change',NEW.details));
 END IF;
 RETURN NEW;
END $$;

-- The session row itself retains the time of access and explicit exit.
-- Stop adding navigation/exit messages to the asset-change log.
CREATE OR REPLACE FUNCTION public.end_current_platform_support_session()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 sid:=public.current_platform_support_session_id();
 IF sid IS NULL THEN RETURN FALSE; END IF;
 UPDATE public.platform_tenant_access_sessions SET ended_at=NOW()
 WHERE id=sid AND administrator_id=auth.uid() AND ended_at IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.end_current_platform_support_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_current_platform_support_session() TO authenticated;
