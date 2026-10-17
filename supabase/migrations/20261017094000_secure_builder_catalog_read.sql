-- Read-only builder catalog for an authenticated business administrator.
-- Tenant scope is derived from the verified auth token, never a supplied tenant ID.
CREATE OR REPLACE FUNCTION public.my_builder_definitions(p_kind text)
RETURNS TABLE(id uuid,name text,description text,configuration jsonb,is_active boolean,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth
AS $$
DECLARE v_tenant uuid; v_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF p_kind NOT IN ('register_builder','report_builder','form_builder','dashboard_builder','document_builder')
 THEN RAISE EXCEPTION 'Invalid builder type'; END IF;
 SELECT p.tenant_id,p.tenant_role INTO v_tenant,v_role
 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=true AND coalesce(p.is_saas_admin,false)=false;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Active business membership required' USING ERRCODE='42501'; END IF;
 IF v_role IS DISTINCT FROM 'tenant_admin' AND NOT EXISTS (
 SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='admin')
 THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT b.id,b.name,b.description,b.configuration,b.is_active,b.updated_at
 FROM public.builder_definitions b
 WHERE b.tenant_id=v_tenant AND b.builder_key=p_kind
 ORDER BY b.updated_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.my_builder_definitions(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_builder_definitions(text) TO authenticated;
