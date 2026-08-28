-- Repair installations where the asset-depreciation migration was skipped or
-- only applied manually. Every statement is idempotent so it is safe on fully
-- migrated databases too.
DO $$ BEGIN
  CREATE TYPE public.depreciation_method AS ENUM ('straight_line','reducing_balance','units_of_production');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.depreciation_frequency AS ENUM ('monthly','quarterly','annually');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS depreciation_method public.depreciation_method,
  ADD COLUMN IF NOT EXISTS useful_life_months integer,
  ADD COLUMN IF NOT EXISTS residual_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_start_date date,
  ADD COLUMN IF NOT EXISTS depreciation_frequency public.depreciation_frequency DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS total_units numeric,
  ADD COLUMN IF NOT EXISTS units_consumed numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_depreciation_date date,
  ADD COLUMN IF NOT EXISTS impairment_amount numeric NOT NULL DEFAULT 0;

-- Ask PostgREST to refresh immediately instead of serving a stale column cache.
NOTIFY pgrst, 'reload schema';
