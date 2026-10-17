CREATE OR REPLACE FUNCTION public.my_published_canvas_layouts(p_kind text)
RETURNS TABLE(id uuid,name text,description text,configuration jsonb,is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth
AS $$
DECLARE v_tenant uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF p_kind NOT IN ('dashboard_builder','report_builder') THEN RAISE EXCEPTION 'Invalid layout type'; END IF;
 SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id=auth.uid()
 AND p.is_active=true AND p.tenant_id IS NOT NULL AND coalesce(p.is_saas_admin,false)=false;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT b.id,b.name,b.description,b.configuration,b.is_active
 FROM public.builder_definitions b WHERE b.tenant_id=v_tenant AND b.builder_key=p_kind AND b.is_active=true
 ORDER BY b.updated_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.my_published_canvas_layouts(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_published_canvas_layouts(text) TO authenticated;
