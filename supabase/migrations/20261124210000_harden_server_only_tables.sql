-- Restrict internal tables to trusted server connections, preserving existing server grants.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';
DO $$
DECLARE
 t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['assetflow_receipt_registry','platform_email_recovery_requests','platform_mfa_preferences','platform_mfa_trusted_devices','platform_partner_logos','platform_security_email_mfa'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
  IF has_table_privilege('anon',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR NOT has_table_privilege('service_role',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'Unexpected permissions for %',t;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.assetflow_receipt_number_seq FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assetflow_issue_receipt_no(text) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
 n integer;
 sample_key text;
 expected_receipt text;
 actual_receipt text;
BEGIN
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname=ANY(ARRAY['assetflow_receipt_registry','platform_email_recovery_requests','platform_mfa_preferences','platform_mfa_trusted_devices','platform_partner_logos','platform_security_email_mfa']) AND c.relrowsecurity;
 IF n<>6 THEN RAISE EXCEPTION 'RLS verification failed'; END IF;
 IF has_sequence_privilege('anon','public.assetflow_receipt_number_seq','USAGE,SELECT,UPDATE') OR has_sequence_privilege('authenticated','public.assetflow_receipt_number_seq','USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Sequence still client-accessible'; END IF;
 IF has_function_privilege('anon','public.assetflow_issue_receipt_no(text)','EXECUTE') OR has_function_privilege('authenticated','public.assetflow_issue_receipt_no(text)','EXECUTE') OR NOT has_function_privilege('service_role','public.assetflow_issue_receipt_no(text)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected receipt function permissions'; END IF;
 -- Check idempotent retrieval only; do not create a test receipt or advance the sequence.
 SELECT event_key,receipt_no INTO sample_key,expected_receipt FROM public.assetflow_receipt_registry LIMIT 1;
 IF FOUND THEN
  SELECT receipt_no INTO actual_receipt FROM public.assetflow_issue_receipt_no(sample_key);
  IF actual_receipt IS DISTINCT FROM expected_receipt THEN RAISE EXCEPTION 'Receipt retrieval failed'; END IF;
  RAISE NOTICE 'Existing receipt retrieval passed';
 ELSE
  RAISE NOTICE 'No existing receipt available; issuance write not tested';
 END IF;
END $$;
COMMIT;
