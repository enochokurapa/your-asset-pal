
ALTER TABLE public.depreciation_runs DROP CONSTRAINT IF EXISTS depreciation_runs_run_type_check;
ALTER TABLE public.depreciation_runs ADD CONSTRAINT depreciation_runs_run_type_check
  CHECK (run_type = ANY (ARRAY['manual'::text,'scheduled'::text,'manual_asset'::text,'missed'::text,'catchup'::text]));
ALTER TABLE public.depreciation_runs DROP CONSTRAINT IF EXISTS depreciation_runs_period_start_period_end_key;
