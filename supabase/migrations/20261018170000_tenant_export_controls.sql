-- Tenant-specific, deny-by-default export and download permissions.
CREATE TABLE IF NOT EXISTS public.tenant_export_controls (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 capability text NOT NULL CHECK (capability IN ('register','template','reports','documents','other')),
 allowed boolean NOT NULL,
 updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,capability)
);
ALTER TABLE public.tenant_export_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_export_controls FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.my_export_permissions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_tenant uuid; v_status text; v_expiry timestamptz; v_paid boolean; v_result jsonb := '{}'::jsonb; v_cap text; v_override boolean;
BEGIN
 SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=true;
 IF v_tenant IS NULL THEN RETURN jsonb_build_object('register',false,'template',false,'reports',false,'documents',false,'other',false); END IF;
 SELECT subscription_status,
   CASE WHEN subscription_status='trial' THEN trial_ends_at ELSE subscription_ends_at END
 INTO v_status,v_expiry FROM public.tenants WHERE id=v_tenant;
 v_paid := v_status='active' AND (v_expiry IS NULL OR v_expiry > now());
 FOREACH v_cap IN ARRAY ARRAY['register','template','reports','documents','other'] LOOP
  SELECT c.allowed INTO v_override FROM public.tenant_export_controls c WHERE c.tenant_id=v_tenant AND c.capability=v_cap;
  v_result := v_result || jsonb_build_object(v_cap,coalesce(v_override,v_paid));
  v_override := null;
 END LOOP;
 RETURN v_result;
END;$$;
CREATE OR REPLACE FUNCTION public.saas_list_tenant_export_controls(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_saas_admin=true AND is_active=true) THEN RAISE EXCEPTION 'SaaS administrator privileges required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant) THEN RAISE EXCEPTION 'Business not found'; END IF;
 SELECT coalesce(jsonb_object_agg(capability,allowed),'{}'::jsonb) INTO v_result FROM public.tenant_export_controls WHERE tenant_id=p_tenant;
 RETURN v_result;
END;$$;
CREATE OR REPLACE FUNCTION public.saas_set_tenant_export_control(p_tenant uuid,p_capability text,p_setting text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_saas_admin=true AND is_active=true) THEN RAISE EXCEPTION 'SaaS administrator privileges required' USING ERRCODE='42501'; END IF;
 IF p_capability NOT IN ('register','template','reports','documents','other') OR p_setting NOT IN ('inherit','allow','deny') THEN RAISE EXCEPTION 'Invalid export capability or setting'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant) THEN RAISE EXCEPTION 'Business not found'; END IF;
 IF p_setting='inherit' THEN
  DELETE FROM public.tenant_export_controls WHERE tenant_id=p_tenant AND capability=p_capability;
 ELSE
  INSERT INTO public.tenant_export_controls(tenant_id,capability,allowed,updated_by,updated_at)
  VALUES(p_tenant,p_capability,p_setting='allow',auth.uid(),now())
  ON CONFLICT(tenant_id,capability) DO UPDATE SET allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now();
 END IF;
 RETURN public.saas_list_tenant_export_controls(p_tenant);
END;$$;
REVOKE ALL ON FUNCTION public.my_export_permissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saas_list_tenant_export_controls(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saas_set_tenant_export_control(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_export_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_list_tenant_export_controls(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_set_tenant_export_control(uuid,text,text) TO authenticated;
