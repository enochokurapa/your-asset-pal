CREATE OR REPLACE FUNCTION public.admin_all_modules()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS
 (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_saas_admin=true AND is_active=true)
 THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sort_order) FROM public.saas_modules m),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_all_modules() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_all_modules() TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_backup_policy()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS
 (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_saas_admin=true AND is_active=true)
 THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('enabled',coalesce(backup_enabled,false),
 'intervalHours',coalesce(backup_interval_hours,24)) FROM public.saas_settings WHERE id=true);
END $$;
REVOKE ALL ON FUNCTION public.admin_backup_policy() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_backup_policy() TO authenticated;
