-- Location, GPS, API v1 and future live-tracking foundation.
-- 2026-10-05

BEGIN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS administrative_area text,
  ADD COLUMN IF NOT EXISTS locality text,
  ADD COLUMN IF NOT EXISTS custom_area text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS gps_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS location_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_location_source_check
    CHECK (location_source IN ('manual','device_gps','map','api','import','live_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.asset_location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  country_code text,
  administrative_area text,
  locality text,
  custom_area text,
  latitude double precision,
  longitude double precision,
  gps_accuracy_m double precision,
  source text NOT NULL DEFAULT 'manual',
  event_type text NOT NULL DEFAULT 'verified',
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_location_events_asset_time
  ON public.asset_location_events(asset_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_location_events_tenant
  ON public.asset_location_events(tenant_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '["assets:read","locations:read","branches:read"]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id, created_at DESC);

-- Scaffold only. No public UI or ingest endpoint is enabled until the module is released.
CREATE TABLE IF NOT EXISTS public.live_tracking_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.saas_modules (module_key,label,globally_enabled,trial_enabled,paid_enabled,sort_order)
VALUES
  ('geolocation','GPS & Geolocation',true,true,true,45),
  ('api_access','API Access',true,true,true,125),
  ('live_tracking','Live Tracking',false,false,true,130)
ON CONFLICT (module_key) DO UPDATE SET
  label=EXCLUDED.label,
  globally_enabled=EXCLUDED.globally_enabled,
  trial_enabled=EXCLUDED.trial_enabled,
  paid_enabled=EXCLUDED.paid_enabled,
  sort_order=EXCLUDED.sort_order,
  updated_at=now();

ALTER TABLE public.asset_location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_tracking_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant read own location events" ON public.asset_location_events;
CREATE POLICY "tenant read own location events" ON public.asset_location_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_saas_admin(auth.uid()));
DROP POLICY IF EXISTS "tenant insert own location events" ON public.asset_location_events;
CREATE POLICY "tenant insert own location events" ON public.asset_location_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

-- API secrets are managed only through trusted server functions/service role.
REVOKE ALL ON public.api_keys FROM anon, authenticated;
REVOKE ALL ON public.live_tracking_sources FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.asset_location_events TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
