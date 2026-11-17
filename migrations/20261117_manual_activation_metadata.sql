ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS last_manual_activation_amount_ugx numeric(18,2);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS last_manual_activation_method text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS last_manual_activation_at timestamptz;
