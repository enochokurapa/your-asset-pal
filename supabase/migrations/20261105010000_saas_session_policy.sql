-- Global, administrator-managed inactivity and password policy.
ALTER TABLE public.saas_settings
  ADD COLUMN IF NOT EXISTS idle_user_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS idle_admin_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS idle_saas_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS password_expiry_days integer;

ALTER TABLE public.saas_settings
  DROP CONSTRAINT IF EXISTS valid_assetflow_session_policy;
ALTER TABLE public.saas_settings
  ADD CONSTRAINT valid_assetflow_session_policy CHECK (
    idle_user_minutes BETWEEN 5 AND 240
    AND idle_admin_minutes BETWEEN 5 AND 120
    AND idle_saas_minutes BETWEEN 5 AND 60
    AND (password_expiry_days IS NULL OR password_expiry_days IN (30,60,90))
  );
