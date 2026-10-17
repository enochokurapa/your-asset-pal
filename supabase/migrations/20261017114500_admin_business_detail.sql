CREATE OR REPLACE FUNCTION public.admin_business_detail(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE t public.tenants%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active=true AND is_saas_admin=true)
 THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.tenants WHERE id=p_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business does not exist'; END IF;
 RETURN jsonb_build_object(
 'tenant',to_jsonb(t)||jsonb_build_object('effective_status',t.subscription_status),
 'metrics',jsonb_build_object(
 'users',(SELECT count(*) FROM public.profiles WHERE tenant_id=p_tenant AND is_active=true),
 'assets',(SELECT count(*) FROM public.assets WHERE tenant_id=p_tenant),
 'branches',(SELECT count(*) FROM public.branches WHERE tenant_id=p_tenant AND is_active=true),
 'assetValue',(SELECT coalesce(sum(purchase_value),0) FROM public.assets WHERE tenant_id=p_tenant)),
 'modules',coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('override',o.enabled,'effectiveEnabled',
 CASE WHEN NOT m.globally_enabled THEN false WHEN o.enabled IS NOT NULL THEN o.enabled
 WHEN t.subscription_status='trial' THEN m.trial_enabled ELSE m.paid_enabled END) ORDER BY m.sort_order)
 FROM public.saas_modules m LEFT JOIN public.tenant_module_overrides o ON o.module_key=m.module_key AND o.tenant_id=p_tenant),'[]'::jsonb),
 'users',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('roles',coalesce((SELECT jsonb_agg(r.role) FROM public.user_roles r WHERE r.user_id=p.id),'[]'::jsonb)) ORDER BY p.created_at)
 FROM public.profiles p WHERE p.tenant_id=p_tenant),'[]'::jsonb),
 'domains',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM public.custom_domains d WHERE d.tenant_id=p_tenant),'[]'::jsonb),
 'branches',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.branches b WHERE b.tenant_id=p_tenant),'[]'::jsonb),
 'billing',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC) FROM (SELECT id,amount,currency,status,created_at FROM public.billing_transactions WHERE tenant_id=p_tenant ORDER BY created_at DESC LIMIT 8) b),'[]'::jsonb),
 'recentActivity',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT id,action,entity_type,created_at FROM public.audit_log WHERE tenant_id=p_tenant ORDER BY created_at DESC LIMIT 10) a),'[]'::jsonb)
 );
END $$;
REVOKE ALL ON FUNCTION public.admin_business_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_business_detail(uuid) TO authenticated;
