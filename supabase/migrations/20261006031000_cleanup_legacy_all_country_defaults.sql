UPDATE public.tenant_location_settings
SET allowed_country_codes = ARRAY[default_country_code]::text[]
WHERE default_country_code IS NOT NULL
  AND cardinality(allowed_country_codes) = 7
  AND allowed_country_codes @> ARRAY['UG','KE','TZ','RW','ZM','MW','ZW']::text[]
  AND allowed_country_codes <@ ARRAY['UG','KE','TZ','RW','ZM','MW','ZW']::text[];

NOTIFY pgrst, 'reload schema';
