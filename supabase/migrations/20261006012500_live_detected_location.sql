-- Keep live/detected telemetry separate from assigned and verified asset location.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS live_latitude double precision,
  ADD COLUMN IF NOT EXISTS live_longitude double precision,
  ADD COLUMN IF NOT EXISTS live_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS live_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_tracking_device_id uuid REFERENCES public.tracking_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_live_recorded_at ON public.assets(live_recorded_at DESC)
WHERE live_recorded_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
