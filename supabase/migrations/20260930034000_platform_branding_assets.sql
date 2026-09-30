-- Expand global AssetFlow 360 platform branding assets.
BEGIN;

ALTER TABLE public.saas_settings
  ADD COLUMN IF NOT EXISTS platform_name text NOT NULL DEFAULT 'AssetFlow 360',
  ADD COLUMN IF NOT EXISTS platform_icon_data_url text,
  ADD COLUMN IF NOT EXISTS platform_primary_color text NOT NULL DEFAULT '#C77435',
  ADD COLUMN IF NOT EXISTS platform_secondary_color text NOT NULL DEFAULT '#4B47DC';

UPDATE public.saas_settings
SET
  platform_name = COALESCE(NULLIF(trim(platform_name), ''), 'AssetFlow 360'),
  platform_primary_color = CASE
    WHEN platform_primary_color ~ '^#[0-9A-Fa-f]{6}

NOTIFY pgrst, 'reload schema';

COMMIT;
 THEN upper(platform_primary_color)
    ELSE '#C77435'
  END,
  platform_secondary_color = CASE
    WHEN platform_secondary_color ~ '^#[0-9A-Fa-f]{6}

NOTIFY pgrst, 'reload schema';

COMMIT;
 THEN upper(platform_secondary_color)
    ELSE '#4B47DC'
  END
WHERE id = true;

ALTER TABLE public.saas_settings
  DROP CONSTRAINT IF EXISTS saas_settings_platform_primary_color_check,
  DROP CONSTRAINT IF EXISTS saas_settings_platform_secondary_color_check;

ALTER TABLE public.saas_settings
  ADD CONSTRAINT saas_settings_platform_primary_color_check
    CHECK (platform_primary_color ~ '^#[0-9A-Fa-f]{6}

NOTIFY pgrst, 'reload schema';

COMMIT;
),
  ADD CONSTRAINT saas_settings_platform_secondary_color_check
    CHECK (platform_secondary_color ~ '^#[0-9A-Fa-f]{6}

NOTIFY pgrst, 'reload schema';

COMMIT;
);

NOTIFY pgrst, 'reload schema';

COMMIT;
