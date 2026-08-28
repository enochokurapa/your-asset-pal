-- Make the SaaS Admin's trial_days setting authoritative for both existing
-- trial workspaces and all future trial starts.

CREATE OR REPLACE FUNCTION public.apply_saas_trial_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trial_days IS DISTINCT FROM OLD.trial_days THEN
    UPDATE public.tenants
       SET trial_ends_at = trial_started_at + make_interval(days => NEW.trial_days),
           updated_at = now()
     WHERE subscription_status = 'trial';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_saas_trial_days ON public.saas_settings;
CREATE TRIGGER apply_saas_trial_days
  AFTER UPDATE OF trial_days ON public.saas_settings
  FOR EACH ROW EXECUTE FUNCTION public.apply_saas_trial_days();

CREATE OR REPLACE FUNCTION public.set_tenant_trial_from_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE configured_days integer;
BEGIN
  IF NEW.subscription_status = 'trial' THEN
    SELECT trial_days INTO configured_days FROM public.saas_settings WHERE id = true;
    IF configured_days IS NULL THEN
      RAISE EXCEPTION 'SaaS trial policy is not configured';
    END IF;
    NEW.trial_started_at := COALESCE(NEW.trial_started_at, now());
    NEW.trial_ends_at := NEW.trial_started_at + make_interval(days => configured_days);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_trial_from_policy ON public.tenants;
CREATE TRIGGER set_tenant_trial_from_policy
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_trial_from_policy();

-- Immediately align existing trials with the value already saved by the SaaS
-- Admin (for example, replace the old 28-day expiry with the configured 10).
UPDATE public.tenants t
   SET trial_ends_at = t.trial_started_at + make_interval(days => s.trial_days),
       updated_at = now()
  FROM public.saas_settings s
 WHERE s.id = true
   AND t.subscription_status = 'trial';

NOTIFY pgrst, 'reload schema';
