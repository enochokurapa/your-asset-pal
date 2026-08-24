-- SaaS control-plane policy layer for AssetFlow.
-- Safe to run on the existing database after complete_init.sql.
-- Introduces SaaS-admin vs tenant-admin separation, 28-day trials,
-- module entitlements, paid custom-domain gating, and billing records.

BEGIN;

-- Supabase/PostgREST service_role must really bypass RLS for trusted server functions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER ROLE service_role BYPASSRLS;
  END IF;
END $$;

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

-- Platform owner. This flag is separate from a tenant application role.
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

CREATE OR REPLACE FUNCTION public.can_manage_tenant_user(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_saas_admin(_actor)
    OR EXISTS (
      SELECT 1
      FROM public.profiles a
      JOIN public.profiles t ON t.id = _target
      WHERE a.id = _actor
        AND a.tenant_role = 'tenant_admin'
        AND a.tenant_id IS NOT NULL
        AND a.tenant_id = t.tenant_id
        AND t.is_saas_admin = false
    );
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

-- Remove legacy cross-workspace profile/role reads and keep tenant-scoped reads.
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles select self" ON public.profiles;
DROP POLICY IF EXISTS "profiles select admin" ON public.profiles;
DROP POLICY IF EXISTS "users read profiles" ON public.profiles;
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
CREATE POLICY "profiles select tenant" ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR id = auth.uid() OR public.is_saas_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select self" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select admin" ON public.user_roles;
CREATE POLICY "user_roles select tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_tenant_user(auth.uid(), user_id));

-- Tenant admins must never be able to alter the SaaS administrator or another tenant's user controls.
DROP POLICY IF EXISTS "tenant safe insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "tenant safe update roles" ON public.user_roles;
DROP POLICY IF EXISTS "tenant safe delete roles" ON public.user_roles;
CREATE POLICY "tenant safe insert roles" AS RESTRICTIVE ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_tenant_user(auth.uid(), user_id));
CREATE POLICY "tenant safe update roles" AS RESTRICTIVE ON public.user_roles FOR UPDATE TO authenticated
  USING (public.can_manage_tenant_user(auth.uid(), user_id))
  WITH CHECK (public.can_manage_tenant_user(auth.uid(), user_id));
CREATE POLICY "tenant safe delete roles" AS RESTRICTIVE ON public.user_roles FOR DELETE TO authenticated
  USING (public.can_manage_tenant_user(auth.uid(), user_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_permissions','user_action_rights','user_approval_rights','user_branch_access']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select self" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select admin" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s tenant read" ON public.%1$I', t);
    EXECUTE format($p$CREATE POLICY "%1$s tenant read" ON public.%1$I
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.can_manage_tenant_user(auth.uid(), user_id))$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s tenant safe insert" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s tenant safe update" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s tenant safe delete" ON public.%1$I', t);
    EXECUTE format($p$CREATE POLICY "%1$s tenant safe insert" AS RESTRICTIVE ON public.%1$I
      FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant_user(auth.uid(), user_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s tenant safe update" AS RESTRICTIVE ON public.%1$I
      FOR UPDATE TO authenticated USING (public.can_manage_tenant_user(auth.uid(), user_id))
      WITH CHECK (public.can_manage_tenant_user(auth.uid(), user_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s tenant safe delete" AS RESTRICTIVE ON public.%1$I
      FOR DELETE TO authenticated USING (public.can_manage_tenant_user(auth.uid(), user_id))$p$, t);
  END LOOP;
END $$;

-- Sensitive SaaS/tenant flags can only be changed by trusted server functions.
-- Browser users may edit only their display name and clear their first-login password flag.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, must_change_password) ON public.profiles TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_saas_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_tenant_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_saas_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_tenant_user(uuid, uuid) TO authenticated, service_role;

COMMIT;
