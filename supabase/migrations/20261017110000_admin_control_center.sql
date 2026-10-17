-- Administrator-only control center, scoped by verified JWT. Read-only.
CREATE OR REPLACE FUNCTION public.admin_control_center()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id=auth.uid() AND is_active=true AND is_saas_admin=true
 ) THEN RAISE EXCEPTION 'Active platform administrator required' USING ERRCODE='42501'; END IF;
 WITH stats AS (
   SELECT t.id,t.name,t.slug,t.plan_code,t.subscription_status,t.trial_ends_at,t.subscription_ends_at,t.created_at,
     CASE WHEN t.subscription_status='trial' AND t.trial_ends_at < now() THEN 'expired'
          WHEN t.subscription_status='active' AND t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at < now() THEN 'expired'
          ELSE coalesce(t.subscription_status,'unknown') END AS effective_status,
     (SELECT count(*) FROM public.profiles p WHERE p.tenant_id=t.id AND p.is_active=true AND coalesce(p.is_saas_admin,false)=false) AS users,
     (SELECT count(*) FROM public.assets a WHERE a.tenant_id=t.id) AS assets,
     (SELECT count(*) FROM public.assets a WHERE a.tenant_id=t.id AND a.created_at>now()-interval '30 days') AS recent_assets,
     (SELECT count(*) FROM public.branches b WHERE b.tenant_id=t.id AND b.is_active=true) AS branches,
     (SELECT max(a.created_at) FROM public.audit_log a WHERE a.tenant_id=t.id) AS last_activity,
     (SELECT coalesce(sum(b.amount),0) FROM public.billing_transactions b WHERE b.tenant_id=t.id AND b.status='successful') AS revenue
   FROM public.tenants t
 ), summary AS (
   SELECT jsonb_build_object(
     'organizations',count(*),'active',count(*) FILTER (WHERE effective_status='active'),
     'trials',count(*) FILTER (WHERE effective_status='trial'),'expired',count(*) FILTER (WHERE effective_status='expired'),
     'suspended',count(*) FILTER (WHERE effective_status='suspended'),
     'users',coalesce(sum(users),0),'assets',coalesce(sum(assets),0),
     'newWorkspaces30d',count(*) FILTER (WHERE created_at>now()-interval '30 days'),
     'assetsAdded30d',coalesce(sum(recent_assets),0),'successfulRevenue',coalesce(sum(revenue),0)) AS value FROM stats
 )
 SELECT jsonb_build_object(
   'summary',(SELECT value FROM summary),
   'tenants',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',id,'name',name,'slug',slug,'planCode',plan_code,'status',effective_status,
     'users',users,'assets',assets,'branches',branches,'lastActivityAt',last_activity)
     ORDER BY created_at DESC) FROM stats),'[]'::jsonb),
   'policy',(SELECT jsonb_build_object('trialDays',trial_days,'trialUserLimit',trial_user_limit,
        'paidPrice',paid_price,'currency',currency) FROM public.saas_settings WHERE id=true),
   'technical',jsonb_build_object('database','operational','authProxyConfigured',null,
     'restProxyConfigured',null,'paymentConfigured',null,'r2Configured',null,
     'backupEnabled',(SELECT backup_enabled FROM public.saas_settings WHERE id=true),
     'backupIntervalHours',(SELECT backup_interval_hours FROM public.saas_settings WHERE id=true))
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_control_center() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_control_center() TO authenticated;
