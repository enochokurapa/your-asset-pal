-- Per-tenant SaaS overrides, preserving all existing values and records.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_days_override integer CHECK (trial_days_override BETWEEN 1 AND 3650);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_user_limit_override integer CHECK (trial_user_limit_override BETWEEN 1 AND 100000);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS paid_price_override numeric(12,2) CHECK (paid_price_override >= 0);
-- A global policy change must not overwrite a tenant-specific trial.
CREATE OR REPLACE FUNCTION public.apply_current_saas_trial_policy()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE configured_days integer; affected_rows integer;
BEGIN
 SELECT trial_days INTO configured_days FROM public.saas_settings WHERE id=true;
 IF configured_days IS NULL OR configured_days < 1 THEN RAISE EXCEPTION 'SaaS trial policy is not configured'; END IF;
 UPDATE public.tenants SET
   trial_started_at=COALESCE(trial_started_at,created_at,now()),
   trial_ends_at=COALESCE(trial_started_at,created_at,now())+make_interval(days=>configured_days),
   updated_at=now()
 WHERE subscription_status='trial' AND trial_days_override IS NULL;
 GET DIAGNOSTICS affected_rows=ROW_COUNT;
 RETURN affected_rows;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_current_saas_trial_policy() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_current_saas_trial_policy() TO service_role;
-- Starting or restarting a trial honors the tenant-specific value.
CREATE OR REPLACE FUNCTION public.set_tenant_trial_from_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE configured_days integer; should_apply boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN should_apply:=NEW.subscription_status='trial';
 ELSE should_apply:=NEW.subscription_status='trial' AND
  (OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
   OR OLD.trial_started_at IS DISTINCT FROM NEW.trial_started_at);
 END IF;
 IF should_apply THEN
   SELECT COALESCE(NEW.trial_days_override,s.trial_days) INTO configured_days
   FROM public.saas_settings s WHERE s.id=true;
   IF configured_days IS NULL OR configured_days<1 THEN RAISE EXCEPTION 'Trial policy is not configured'; END IF;
   IF TG_OP='UPDATE' AND OLD.subscription_status IS DISTINCT FROM 'trial' THEN
      NEW.trial_started_at:=now();
   ELSE NEW.trial_started_at:=COALESCE(NEW.trial_started_at,now()); END IF;
   NEW.trial_ends_at:=NEW.trial_started_at+make_interval(days=>configured_days);
 END IF;
 RETURN NEW;
END; $$;
NOTIFY pgrst,'reload schema';
