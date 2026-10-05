-- Tenant-controlled country availability for asset location capture.
ALTER TABLE public.tenant_location_settings
  ADD COLUMN IF NOT EXISTS allowed_country_codes text[] NOT NULL
  DEFAULT ARRAY['UG','KE','TZ','RW','ZM','MW','ZW']::text[];

-- Keep existing default countries valid members of the allowed set.
UPDATE public.tenant_location_settings
SET allowed_country_codes = array_append(allowed_country_codes, default_country_code)
WHERE default_country_code IS NOT NULL
  AND NOT (default_country_code = ANY(allowed_country_codes));

NOTIFY pgrst, 'reload schema';
