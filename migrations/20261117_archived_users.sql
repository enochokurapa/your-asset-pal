ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS profiles_active_nonarchived_idx ON public.profiles(tenant_id,is_active) WHERE archived_at IS NULL;
