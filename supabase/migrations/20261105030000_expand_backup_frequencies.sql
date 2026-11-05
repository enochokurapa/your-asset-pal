-- Enable more flexible SaaS-admin backup scheduling while retaining the existing settings.
-- Apply to PostgreSQL before deploying an app that accepts 12-hour or weekly intervals.
ALTER TABLE public.saas_settings
  DROP CONSTRAINT IF EXISTS saas_settings_backup_interval_hours_check;
ALTER TABLE public.saas_settings
  ADD CONSTRAINT saas_settings_backup_interval_hours_check
  CHECK (backup_interval_hours IN (6, 12, 24, 168));
