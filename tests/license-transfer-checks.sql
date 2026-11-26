\set ON_ERROR_STOP on
DO $test$
DECLARE
 t uuid:='10000000-0000-4000-8000-000000000001';
 actor uuid:='20000000-0000-4000-8000-000000000001';
 src uuid:='20000000-0000-4000-8000-000000000002';
 foreign_user uuid:='20000000-0000-4000-8000-000000000005';
 dst uuid:='20000000-0000-4000-8000-000000000006';
 dst2 uuid:='20000000-0000-4000-8000-000000000007';
 req uuid:='30000000-0000-4000-8000-000000000001';
 event uuid;
BEGIN
 IF has_table_privilege('authenticated','public.user_license_events','INSERT') OR has_table_privilege('authenticated','public.user_license_events','SELECT') OR has_function_privilege('authenticated','public.transfer_user_license(uuid,uuid,uuid,uuid,uuid,public.app_role,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser privileges must be denied'; END IF;
 event:=public.transfer_user_license(t,actor,NULL,src,dst,'manager','Employee replacement',req);
 IF event IS NULL OR (SELECT count(*) FROM public.profiles WHERE tenant_id=t AND is_active)<>4 THEN RAISE EXCEPTION 'Full-plan transfer failed'; END IF;
 IF (SELECT is_active FROM public.profiles WHERE id=src) OR NOT (SELECT is_active FROM public.profiles WHERE id=dst) OR (SELECT tenant_id FROM public.profiles WHERE id=dst)<>t THEN RAISE EXCEPTION 'Account state invalid'; END IF;
 IF EXISTS(SELECT 1 FROM auth.sessions WHERE user_id IN(src,dst)) OR (SELECT banned_until FROM auth.users WHERE id=src)<=now() OR (SELECT banned_until FROM auth.users WHERE id=dst) IS NOT NULL OR EXISTS(SELECT 1 FROM public.platform_mfa_trusted_devices WHERE user_id=src AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Session or ban state invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=dst AND role='manager') OR (SELECT count(*) FROM public.user_roles WHERE user_id=dst)<>1 THEN RAISE EXCEPTION 'Replacement role invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_license_events WHERE id=event AND seats_before=4 AND seats_after=4 AND source_user_id=src AND target_user_id=dst AND reason='Employee replacement') THEN RAISE EXCEPTION 'Missing transfer ledger'; END IF;
 IF public.transfer_user_license(t,actor,NULL,src,dst,'manager','Employee replacement',req)<>event THEN RAISE EXCEPTION 'Retry did not return the same receipt'; END IF;
 IF (SELECT count(*) FROM public.user_license_events)<>1 THEN RAISE EXCEPTION 'Duplicate receipt'; END IF;
 PERFORM set_config('test.uid',src::text,true);
 IF public.current_tenant_id() IS NOT NULL THEN RAISE EXCEPTION 'Inactive user still has tenant scope'; END IF;
 BEGIN
  PERFORM public.transfer_user_license(t,actor,NULL,foreign_user,dst2,'staff','Cross tenant must fail',gen_random_uuid());
  RAISE EXCEPTION 'Cross tenant accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM public.transfer_user_license(t,actor,NULL,actor,dst2,'staff','Self transfer must fail',gen_random_uuid());
  RAISE EXCEPTION 'Self transfer accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  UPDATE public.user_license_events SET reason='tampered';
  RAISE EXCEPTION 'Audit update accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  DELETE FROM public.user_license_events;
  RAISE EXCEPTION 'Audit deletion accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  UPDATE public.profiles SET is_active=true WHERE id=src;
  RAISE EXCEPTION 'Seat limit bypass accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 IF (SELECT count(*) FROM public.user_license_events)<>1 OR (SELECT is_active FROM public.profiles WHERE id=src) OR (SELECT tenant_id FROM public.profiles WHERE id=dst2) IS NOT NULL THEN RAISE EXCEPTION 'Rejection changed state'; END IF;
 RAISE NOTICE 'License fixture tests passed';
END $test$;
