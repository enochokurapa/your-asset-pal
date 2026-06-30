
ALTER TABLE public.depreciation_runs
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS error_stack TEXT;

CREATE TABLE IF NOT EXISTS public.depreciation_run_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.depreciation_runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('info','success','warning','error')),
  message TEXT,
  asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.depreciation_run_logs TO authenticated;
GRANT ALL ON public.depreciation_run_logs TO service_role;

ALTER TABLE public.depreciation_run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read run logs" ON public.depreciation_run_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert run logs" ON public.depreciation_run_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_manager(auth.uid()) OR can_do(auth.uid(),'run_depreciation'));

CREATE INDEX IF NOT EXISTS depreciation_run_logs_run_id_idx
  ON public.depreciation_run_logs(run_id, created_at);

-- Notification trigger when a depreciation run fails
CREATE OR REPLACE FUNCTION public.notify_on_failed_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'failed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'failed' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      VALUES (
        r.user_id,
        'depreciation_run_failed',
        'Depreciation run failed · ' || NEW.period_start || ' → ' || NEW.period_end,
        COALESCE(NULLIF(NEW.error_message, ''), NEW.notes, 'Run was marked failed.'),
        'depreciation_runs',
        NEW.id,
        false,
        true
      );
    END LOOP;
    -- Also notify the user who triggered the run, if not admin/manager already covered
    IF NEW.triggered_by IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      SELECT NEW.triggered_by, 'depreciation_run_failed',
             'Your depreciation run failed · ' || NEW.period_start || ' → ' || NEW.period_end,
             COALESCE(NULLIF(NEW.error_message, ''), NEW.notes, 'Run was marked failed.'),
             'depreciation_runs', NEW.id, false, true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = NEW.triggered_by AND role IN ('admin','manager')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_failed_dep_run ON public.depreciation_runs;
CREATE TRIGGER notify_failed_dep_run
AFTER INSERT OR UPDATE ON public.depreciation_runs
FOR EACH ROW EXECUTE FUNCTION public.notify_on_failed_depreciation_run();
