ALTER TABLE public.saas_modules
  ADD COLUMN IF NOT EXISTS add_on_price numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.billing_transactions
  ADD COLUMN IF NOT EXISTS module_key text;

ALTER TABLE public.billing_transactions
  ADD CONSTRAINT billing_transactions_module_key_fkey
  FOREIGN KEY (module_key) REFERENCES public.saas_modules(module_key)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billing_transactions_module
  ON public.billing_transactions(tenant_id, module_key, created_at DESC);

UPDATE public.saas_modules SET add_on_price = 0 WHERE billing_model <> 'add_on';
