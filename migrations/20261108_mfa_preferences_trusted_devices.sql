BEGIN;
CREATE TABLE IF NOT EXISTS public.platform_mfa_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 method varchar(12) NOT NULL CHECK(method IN ('email','app')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_mfa_trusted_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 last_used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS platform_mfa_trusted_devices_user_idx ON public.platform_mfa_trusted_devices(user_id,expires_at);
REVOKE ALL ON public.platform_mfa_preferences,public.platform_mfa_trusted_devices FROM PUBLIC,anon,authenticated;
COMMIT;
