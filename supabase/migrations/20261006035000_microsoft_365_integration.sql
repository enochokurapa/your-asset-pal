BEGIN;

CREATE TABLE IF NOT EXISTS public.microsoft_365_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  microsoft_tenant_id text,
  microsoft_user_id text,
  account_email text,
  display_name text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  refresh_token_ciphertext text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','needs_reauth','disconnected','error')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  connected_by uuid,
  last_sync_at timestamptz,
  last_sync_status text,
  directory_user_count integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.microsoft_365_oauth_states (
  state_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.microsoft_365_directory_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  microsoft_user_id text NOT NULL,
  display_name text NOT NULL,
  given_name text,
  surname text,
  mail text,
  user_principal_name text,
  job_title text,
  department text,
  office_location text,
  business_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  mobile_phone text,
  account_enabled boolean,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,microsoft_user_id)
);

CREATE INDEX IF NOT EXISTS microsoft_365_directory_users_tenant_name_idx
  ON public.microsoft_365_directory_users(tenant_id, lower(display_name));
CREATE INDEX IF NOT EXISTS microsoft_365_directory_users_tenant_mail_idx
  ON public.microsoft_365_directory_users(tenant_id, lower(coalesce(mail,user_principal_name,'')));

ALTER TABLE public.microsoft_365_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_365_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_365_directory_users ENABLE ROW LEVEL SECURITY;

-- OAuth secrets/tokens are intentionally server-only. No authenticated client policy
-- is created for connections or oauth_states.
DROP POLICY IF EXISTS "tenant admins read microsoft directory cache" ON public.microsoft_365_directory_users;
CREATE POLICY "tenant admins read microsoft directory cache"
ON public.microsoft_365_directory_users FOR SELECT TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.tenant_role = 'tenant_admin' OR p.is_saas_admin = true)
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
