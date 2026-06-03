
-- Enums
DO $$ BEGIN
  CREATE TYPE public.depreciation_method AS ENUM ('straight_line','reducing_balance','units_of_production');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.depreciation_frequency AS ENUM ('monthly','quarterly','annually');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend assets
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

-- Category defaults
CREATE TABLE IF NOT EXISTS public.category_depreciation_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE,
  method public.depreciation_method NOT NULL,
  useful_life_months integer NOT NULL CHECK (useful_life_months > 0),
  residual_percent numeric NOT NULL DEFAULT 0 CHECK (residual_percent >= 0 AND residual_percent < 100),
  frequency public.depreciation_frequency NOT NULL DEFAULT 'monthly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_depreciation_defaults TO authenticated;
GRANT ALL ON public.category_depreciation_defaults TO service_role;
ALTER TABLE public.category_depreciation_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cat_dep_defaults" ON public.category_depreciation_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write cat_dep_defaults" ON public.category_depreciation_defaults
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- Runs
CREATE TABLE IF NOT EXISTS public.depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  run_type text NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual','scheduled')),
  triggered_by uuid,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed','running')),
  total_amount numeric NOT NULL DEFAULT 0,
  asset_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_runs TO authenticated;
GRANT ALL ON public.depreciation_runs TO service_role;
ALTER TABLE public.depreciation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dep_runs" ON public.depreciation_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr insert dep_runs" ON public.depreciation_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'));
CREATE POLICY "mgr update dep_runs" ON public.depreciation_runs
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'));
CREATE POLICY "admin delete dep_runs" ON public.depreciation_runs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- Entries
CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.depreciation_runs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  method public.depreciation_method NOT NULL,
  opening_value numeric NOT NULL,
  depreciation_amount numeric NOT NULL,
  accumulated_after numeric NOT NULL,
  closing_value numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_end)
);
CREATE INDEX IF NOT EXISTS idx_dep_entries_asset ON public.depreciation_entries(asset_id);
CREATE INDEX IF NOT EXISTS idx_dep_entries_period ON public.depreciation_entries(period_end);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_entries TO authenticated;
GRANT ALL ON public.depreciation_entries TO service_role;
ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dep_entries" ON public.depreciation_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write dep_entries" ON public.depreciation_entries
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'))
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'));

-- Overrides (impairment / manual adj)
CREATE TABLE IF NOT EXISTS public.depreciation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL CHECK (type IN ('impairment','manual_adjustment','residual_change')),
  amount numeric NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dep_overrides_asset ON public.depreciation_overrides(asset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_overrides TO authenticated;
GRANT ALL ON public.depreciation_overrides TO service_role;
ALTER TABLE public.depreciation_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dep_overrides" ON public.depreciation_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write dep_overrides" ON public.depreciation_overrides
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'override_depreciation'))
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'override_depreciation'));

-- Audit triggers
DROP TRIGGER IF EXISTS audit_dep_runs ON public.depreciation_runs;
CREATE TRIGGER audit_dep_runs AFTER INSERT OR UPDATE OR DELETE ON public.depreciation_runs
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS audit_dep_overrides ON public.depreciation_overrides;
CREATE TRIGGER audit_dep_overrides AFTER INSERT OR UPDATE OR DELETE ON public.depreciation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();

-- Validation trigger on assets for depreciation config sanity
CREATE OR REPLACE FUNCTION public.validate_asset_depreciation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.residual_value IS NOT NULL AND NEW.purchase_value IS NOT NULL
     AND NEW.residual_value < 0 THEN
    RAISE EXCEPTION 'Residual value cannot be negative';
  END IF;
  IF NEW.residual_value IS NOT NULL AND NEW.purchase_value IS NOT NULL
     AND NEW.residual_value >= NEW.purchase_value THEN
    RAISE EXCEPTION 'Residual value must be less than purchase value';
  END IF;
  IF NEW.useful_life_months IS NOT NULL AND NEW.useful_life_months <= 0 THEN
    RAISE EXCEPTION 'Useful life must be greater than 0';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_asset_depreciation ON public.assets;
CREATE TRIGGER validate_asset_depreciation BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_asset_depreciation();
