-- Five independent, tenant-scoped builders. No existing asset data is modified.
INSERT INTO public.saas_modules (module_key,label,sort_order,globally_enabled,trial_enabled,paid_enabled,billing_model,add_on_price)
VALUES
 ('register_builder','Register Builder',110,false,false,true,'included',0),
 ('report_builder','Report Builder',111,false,false,true,'included',0),
 ('form_builder','Form Builder',112,false,false,true,'included',0),
 ('dashboard_builder','Dashboard Builder',113,false,false,true,'included',0),
 ('document_builder','Document Builder',114,false,false,true,'included',0)
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.builder_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 builder_key text NOT NULL CHECK (builder_key IN ('register_builder','report_builder','form_builder','dashboard_builder','document_builder')),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
 description text NOT NULL DEFAULT '',
 configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,builder_key,name)
);
CREATE INDEX IF NOT EXISTS builder_definitions_tenant_kind ON public.builder_definitions(tenant_id,builder_key);
ALTER TABLE public.builder_definitions ENABLE ROW LEVEL SECURITY;
-- Definitions are read and written only by authenticated, tenant-authorized server functions.
REVOKE ALL ON public.builder_definitions FROM anon, authenticated;
