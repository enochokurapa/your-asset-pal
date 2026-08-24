-- SaaS control-plane policy layer for AssetFlow.
-- Safe to run on the existing database after complete_init.sql.
-- This introduces SaaS-admin vs tenant-admin separation, 28-day trials,
-- module entitlements, paid custom-domain gating, and billing records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.saas_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  trial_days integer NOT NULL DEFAULT 28 CHECK (trial_days > 0),
  trial_user_limit integer NOT NULL DEFAULT 4 CHECK (trial_user_limit > 0),
  paid_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_price >= 0),
  currency text NOT NULL DEFAULT 'UGX',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.saas_settings (id, trial_days, trial_user_limit, paid_price, currency)
VALUES (true, 28, 4, 0, 'UGX')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','expired','suspended')),
  plan_code text NOT NULL DEFAULT 'trial',
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '28 days'),
  subscription_started_at timestamptz,
  subscription_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (name, slug, subscription_status, plan_code, trial_ends_at)
SELECT 'Default Workspace', 'default', 'trial', 'trial', now() + interval '28 days'
WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'default');

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_role text NOT NULL DEFAULT 'member'
  CHECK (tenant_role IN ('tenant_admin','member'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_saas_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles p
SET tenant_id = (SELECT id FROM public.tenants WHERE slug='default' LIMIT 1)
WHERE p.tenant_id IS NULL;

UPDATE public.profiles p
SET tenant_role = CASE
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin') THEN 'tenant_admin'
  ELSE 'member'
END;

-- SaaS owner account. This is separate from the tenant 'admin' application role.
UPDATE public.profiles
SET is_saas_admin = true
WHERE lower(email) = 'tesobrain@gmail.com';

CREATE TABLE IF NOT EXISTS public.saas_modules (
  module_key text PRIMARY KEY,
  label text NOT NULL,
  globally_enabled boolean NOT NULL DEFAULT true,
  trial_enabled boolean NOT NULL DEFAULT true,
  paid_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.saas_modules (module_key,label,sort_order) VALUES
  ('dashboard','Dashboard',10),
  ('assets','Assets',20),
  ('categories','Categories',30),
  ('locations','Locations',40),
  ('branches','Branches',50),
  ('depreciation','Depreciation',60),
  ('gate_pass','Gate Pass',70),
  ('verification','Verification',80),
  ('reports','Reports',90),
  ('audit','Audit Trail',100),
  ('users','Users',110),
  ('settings','Settings',120)
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenant_module_overrides (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.saas_modules(module_key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  verification_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','active','failed')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'yo_uganda',
  provider_reference text,
  phone text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','successful','failed','cancelled')),
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_tenant ON public.custom_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_tenant ON public.billing_transactions(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_saas_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_uid AND p.is_saas_admin=true);
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tenant_id FROM public.profiles WHERE id=auth.uid();
$$;

ALTER TABLE public.saas_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_module_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read saas settings" ON public.saas_settings;
CREATE POLICY "authenticated read saas settings" ON public.saas_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read modules" ON public.saas_modules;
CREATE POLICY "authenticated read modules" ON public.saas_modules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant read own tenant" ON public.tenants;
CREATE POLICY "tenant read own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant read own module overrides" ON public.tenant_module_overrides;
CREATE POLICY "tenant read own module overrides" ON public.tenant_module_overrides FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant read own domains" ON public.custom_domains;
CREATE POLICY "tenant read own domains" ON public.custom_domains FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant read own billing" ON public.billing_transactions;
CREATE POLICY "tenant read own billing" ON public.billing_transactions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.is_saas_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_saas_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;

COMMIT;
