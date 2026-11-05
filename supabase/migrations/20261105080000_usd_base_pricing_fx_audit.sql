-- Pricing packages were already denominated in USD; correct their published label.
-- Existing successful UGX transaction amounts remain unchanged.
UPDATE public.saas_settings SET currency='USD', updated_at=now()
WHERE id=true AND currency='UGX';

CREATE TABLE IF NOT EXISTS public.platform_exchange_rates (
  pair text PRIMARY KEY CHECK(pair='USD/UGX'),
  rate numeric(18,6) NOT NULL CHECK(rate > 2000 AND rate < 8000),
  source text NOT NULL DEFAULT 'open.er-api.com',
  source_timestamp timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_exchange_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_exchange_rates FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.platform_exchange_rates TO service_role;

ALTER TABLE public.billing_transactions
 ADD COLUMN IF NOT EXISTS base_amount_usd numeric(18,2),
 ADD COLUMN IF NOT EXISTS conversion_rate numeric(18,6),
 ADD COLUMN IF NOT EXISTS conversion_source text,
 ADD COLUMN IF NOT EXISTS conversion_timestamp timestamptz;
ALTER TABLE public.seat_purchase_transactions
 ADD COLUMN IF NOT EXISTS base_amount_usd numeric(18,2),
 ADD COLUMN IF NOT EXISTS conversion_rate numeric(18,6),
 ADD COLUMN IF NOT EXISTS conversion_timestamp timestamptz;
ALTER TABLE public.asset_capacity_purchases
 ADD COLUMN IF NOT EXISTS base_amount_usd numeric(18,2),
 ADD COLUMN IF NOT EXISTS conversion_rate numeric(18,6),
 ADD COLUMN IF NOT EXISTS conversion_timestamp timestamptz;
NOTIFY pgrst, 'reload schema';
