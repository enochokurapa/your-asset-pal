-- Expand global AssetFlow 360 platform branding assets.
BEGIN;

ALTER TABLE public.saas_settings
  ADD COLUMN IF NOT EXISTS platform_name text NOT NULL DEFAULT 'AssetFlow 360',
  ADD COLUMN IF NOT EXISTS platform_icon_data_url text;

UPDATE public.saas_settings
SET platform_name = COALESCE(NULLIF(trim(platform_name), ''), 'AssetFlow 360')
WHERE id = true;

NOTIFY pgrst, 'reload schema';

COMMIT;
