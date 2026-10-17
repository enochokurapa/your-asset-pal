CREATE OR REPLACE FUNCTION public.admin_pricing_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active=true AND is_saas_admin=true)
 THEN RAISE EXCEPTION 'SaaS administrator access required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'plans',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.monthly_price) FROM public.saas_pricing_plans p),'[]'::jsonb),
 'modules',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sort_order) FROM public.saas_modules m WHERE m.globally_enabled=true AND m.billing_model<>'add_on'),'[]'::jsonb),
 'policy',(SELECT to_jsonb(s) FROM public.saas_settings s WHERE s.id=true));
END $$;
REVOKE ALL ON FUNCTION public.admin_pricing_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_pricing_catalog() TO authenticated;
