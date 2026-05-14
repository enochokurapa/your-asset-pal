ALTER TABLE public.asset_disposals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.asset_disposals
  DROP CONSTRAINT IF EXISTS asset_disposals_status_check;
ALTER TABLE public.asset_disposals
  ADD CONSTRAINT asset_disposals_status_check
  CHECK (status IN ('pending','approved','rejected'));