ALTER TABLE public.saas_pricing_plans ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(enabled_modules)='array');
UPDATE public.saas_pricing_plans SET enabled_modules=CASE id
 WHEN 'starter' THEN '["assets","categories","locations","branches","users","dashboard","reports","settings"]'::jsonb
 WHEN 'business' THEN '["assets","categories","locations","branches","users","dashboard","reports","settings","verification","depreciation","register_builder","form_builder","audit"]'::jsonb
 ELSE '["assets","categories","locations","branches","users","dashboard","reports","settings","verification","depreciation","register_builder","form_builder","audit","report_builder","dashboard_builder","document_builder","gate_pass","geolocation"]'::jsonb END
WHERE enabled_modules='[]'::jsonb;
NOTIFY pgrst,'reload schema';
