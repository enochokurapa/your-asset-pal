ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS ui_theme jsonb NOT NULL DEFAULT '{"presetId":"ocean"}'::jsonb;
