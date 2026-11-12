-- Contextual support access to the EXISTING tenant portal.
-- PostgREST forwards request.headers, allowing one selected session per browser tab
-- while preserving the true SaaS Admin auth.uid() for audit attribution.
CREATE OR REPLACE FUNCTION public.current_platform_support_session_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 hdr jsonb;
 raw_id text;
 support_id uuid;
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
    AND s.ended_at IS NULL AND s.expires_at>now()
  LIMIT 1
 );
END $$;
CREATE OR REPLACE FUNCTION public.current_platform_support_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.tenant_id FROM public.platform_tenant_access_sessions s
 WHERE s.id=public.current_platform_support_session_id();
$$;
CREATE OR REPLACE FUNCTION public.current_platform_support_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('sessionId',s.id,'tenantId',s.tenant_id,
    'tenantName',t.name,'expiresAt',s.expires_at)
 FROM public.platform_tenant_access_sessions s
 JOIN public.tenants t ON t.id=s.tenant_id
 WHERE s.id=public.current_platform_support_session_id();
$$;
REVOKE ALL ON FUNCTION public.current_platform_support_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_platform_support_context() TO authenticated;

-- Tenant boundary applies to ordinary tenants or the current, audited support context.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(
    public.current_platform_support_tenant_id(),
    (SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid())
 );
$$;
-- Tenant admin powers are only elevated while an authenticated, scoped support session exists.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
 OR (_user_id=auth.uid() AND _role='admin'::public.app_role
      AND public.current_platform_support_session_id() IS NOT NULL);
$$;
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','manager'))
 OR (_user_id=auth.uid() AND public.current_platform_support_session_id() IS NOT NULL);
$$;

-- Existing audit_log keeps actor_user_id as the REAL SaaS Admin.
-- Copy every audited tenant mutation into the immutable support session audit.
CREATE OR REPLACE FUNCTION public.audit_platform_support_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid;
BEGIN
 s:=public.current_platform_support_session_id();
 IF s IS NOT NULL AND NEW.actor_user_id=auth.uid() AND
   NEW.tenant_id=public.current_platform_support_tenant_id() THEN
   INSERT INTO public.platform_tenant_access_audit
   (session_id,tenant_id,actor_id,action,details)
   VALUES (s,NEW.tenant_id,auth.uid(),'tenant_'||NEW.action,
     jsonb_build_object('entityType',NEW.entity_type,'entityId',NEW.entity_id,
       'auditId',NEW.id,'change',NEW.details));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_platform_support_changes ON public.audit_log;
CREATE TRIGGER audit_platform_support_changes AFTER INSERT ON public.audit_log
 FOR EACH ROW EXECUTE FUNCTION public.audit_platform_support_change();

-- Called only by the SaaS Admin while support mode is active.
CREATE OR REPLACE FUNCTION public.end_current_platform_support_session()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; tid uuid;
BEGIN
 sid:=public.current_platform_support_session_id();
 IF sid IS NULL THEN RETURN FALSE; END IF;
 UPDATE public.platform_tenant_access_sessions SET ended_at=now()
 WHERE id=sid AND administrator_id=auth.uid() AND ended_at IS NULL
 RETURNING tenant_id INTO tid;
 IF tid IS NULL THEN RETURN FALSE; END IF;
 INSERT INTO public.platform_tenant_access_audit(session_id,tenant_id,actor_id,action)
 VALUES(sid,tid,auth.uid(),'original_tenant_portal_exited');
 RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.end_current_platform_support_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_current_platform_support_session() TO authenticated;

-- Preserve the true SaaS actor on newly created customer records.
-- The existing tenant reference trigger normally rejects created_by outside the business.
-- The only exception is the current authenticated platform administrator in a
-- live, request-scoped support session for precisely this business.
CREATE OR REPLACE FUNCTION public.enforce_same_tenant_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 reference_id uuid;
 reference_tenant uuid;
 reference_table text:=TG_ARGV[0];
 reference_column text:=TG_ARGV[1];
BEGIN
 reference_id:=NULLIF(to_jsonb(NEW)->>reference_column,'')::uuid;
 IF reference_id IS NULL THEN RETURN NEW; END IF;
 EXECUTE format('SELECT tenant_id FROM public.%I WHERE id=$1',reference_table)
   INTO reference_tenant USING reference_id;
 IF reference_tenant IS NULL OR reference_tenant IS DISTINCT FROM NEW.tenant_id THEN
  IF reference_table='profiles' AND reference_column IN ('created_by','updated_by','verified_by')
   AND reference_id=auth.uid()
   AND public.current_platform_support_session_id() IS NOT NULL
   AND public.current_platform_support_tenant_id()=NEW.tenant_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cross-tenant reference blocked for %.%',TG_TABLE_NAME,reference_column;
 END IF;
 RETURN NEW;
END $$;
