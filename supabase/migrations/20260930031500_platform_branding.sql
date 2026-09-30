-- Global platform branding controlled only by the SaaS administrator.
BEGIN;

ALTER TABLE public.saas_settings
  ADD COLUMN IF NOT EXISTS platform_logo_data_url text;

NOTIFY pgrst, 'reload schema';

COMMIT;
