-- Make SaaS policy changes authoritative platform-wide and add backup scheduling settings.

ALTER TABLE public.saas_settings
  ADD COLUMN IF NOT EXISTS backup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS backup_interval_hours integer NOT NULL DEFAULT 24;

DO $$
BEGIN
  ALTER TABLE public.saas_settings
    ADD CONSTRAINT saas_settings_backup_interval_hours_check
    CHECK (backup_interval_hours IN (6, 24));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One explicit operation that can be called by trusted server code after a policy update.
-- The UPDATE trigger below already keeps active trials aligned; this function also gives
-- the server an authoritative way to re-apply/verify the current policy.
CREATE OR REPLACE FUNCTION public.apply_current_saas_trial_policy()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_days integer;
  affected_rows integer;
BEGIN
  SELECT trial_days
    INTO configured_days
    FROM public.saas_settings
   WHERE id = true;

  IF configured_days IS NULL OR configured_days < 1 THEN
    RAISE EXCEPTION 'SaaS trial policy is not configured';
  END IF;

  UPDATE public.tenants
     SET trial_started_at = COALESCE(trial_started_at, created_at, now()),
         trial_ends_at = COALESCE(trial_started_at, created_at, now()) + make_interval(days => configured_days),
         updated_at = now()
   WHERE subscription_status = 'trial';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_current_saas_trial_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_current_saas_trial_policy() TO service_role;

-- Recalculate every active trial whenever the SaaS Admin changes trial_days.
CREATE OR REPLACE FUNCTION public.apply_saas_trial_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trial_days IS DISTINCT FROM OLD.trial_days THEN
    PERFORM public.apply_current_saas_trial_policy();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_saas_trial_days ON public.saas_settings;
CREATE TRIGGER apply_saas_trial_days
  AFTER UPDATE OF trial_days ON public.saas_settings
  FOR EACH ROW EXECUTE FUNCTION public.apply_saas_trial_days();

-- Every future insert OR transition back to trial must read the current SaaS policy.
-- This closes paths that bypass the application server and prevents a 28-day/default
-- value from becoming authoritative again.
CREATE OR REPLACE FUNCTION public.set_tenant_trial_from_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_days integer;
  should_apply boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_apply := NEW.subscription_status = 'trial';
  ELSE
    should_apply := NEW.subscription_status = 'trial'
      AND (
        OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
        OR OLD.trial_started_at IS DISTINCT FROM NEW.trial_started_at
      );
  END IF;

  IF should_apply THEN
    SELECT trial_days
      INTO configured_days
      FROM public.saas_settings
     WHERE id = true;

    IF configured_days IS NULL OR configured_days < 1 THEN
      RAISE EXCEPTION 'SaaS trial policy is not configured';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.subscription_status IS DISTINCT FROM 'trial' THEN
      NEW.trial_started_at := now();
    ELSE
      NEW.trial_started_at := COALESCE(NEW.trial_started_at, now());
    END IF;

    NEW.trial_ends_at := NEW.trial_started_at + make_interval(days => configured_days);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_trial_from_policy ON public.tenants;
CREATE TRIGGER set_tenant_trial_from_policy
  BEFORE INSERT OR UPDATE OF subscription_status, trial_started_at ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_trial_from_policy();

-- Align existing trial workspaces immediately with the value currently saved by the SaaS Admin.
SELECT public.apply_current_saas_trial_policy();

NOTIFY pgrst, 'reload schema';
