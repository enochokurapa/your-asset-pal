-- Countries are global reference data, but tenant availability must be configured explicitly.
ALTER TABLE public.tenant_location_settings
  ALTER COLUMN allowed_country_codes SET DEFAULT ARRAY[]::text[];

UPDATE public.tenant_location_settings
SET allowed_country_codes =
  CASE
    WHEN default_country_code IS NOT NULL THEN ARRAY[default_country_code]::text[]
    ELSE ARRAY[]::text[]
  END
WHERE allowed_country_codes = ARRAY['UG','KE','TZ','RW','ZM','MW','ZW']::text[];

-- Irrelevant requirements must not leak from a previous location mode.
UPDATE public.tenant_location_settings
SET
  require_geography = CASE WHEN location_mode IN ('geographic','hybrid') THEN require_geography ELSE false END,
  require_gps = CASE WHEN location_mode IN ('geographic','hybrid') THEN require_gps ELSE false END,
  require_branch = CASE WHEN location_mode IN ('branch','hybrid') THEN require_branch ELSE false END,
  require_internal_location = CASE WHEN location_mode IN ('internal','hybrid') THEN require_internal_location ELSE false END;

NOTIFY pgrst, 'reload schema';
