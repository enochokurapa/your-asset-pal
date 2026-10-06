ALTER TABLE public.saas_modules
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'included';

ALTER TABLE public.saas_modules
  DROP CONSTRAINT IF EXISTS saas_modules_billing_model_check;

ALTER TABLE public.saas_modules
  ADD CONSTRAINT saas_modules_billing_model_check
  CHECK (billing_model IN ('included','add_on'));

UPDATE public.saas_modules
SET billing_model = 'add_on',
    trial_enabled = false,
    paid_enabled = false,
    updated_at = now()
WHERE module_key IN ('api_access','live_tracking');

UPDATE public.saas_modules
SET billing_model = 'included'
WHERE module_key NOT IN ('api_access','live_tracking');
