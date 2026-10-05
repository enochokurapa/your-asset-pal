UPDATE public.tenant_location_settings
SET allowed_country_codes = ARRAY[]::text[], default_country_code = NULL
WHERE location_mode NOT IN ('geographic','hybrid');

NOTIFY pgrst, 'reload schema';
