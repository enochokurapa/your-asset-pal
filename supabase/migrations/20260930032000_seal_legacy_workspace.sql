-- Preserve the existing pesapal.owltechsolutionsltd.com installation as one
-- isolated legacy tenant. Existing users remain members of this tenant, while
-- every new public signup starts with tenant_id = NULL until a fresh workspace
-- is provisioned by the free-trial flow.
BEGIN;

UPDATE public.tenants
SET
  name = 'Legacy AssetFlow Workspace',
  subscription_status = 'active',
  plan_code = 'paid',
  updated_at = now()
WHERE slug = 'default';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, tenant_id, tenant_role, is_saas_admin, is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULL,
    'member',
    false,
    true
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
