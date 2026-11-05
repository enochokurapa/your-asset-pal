-- Credential records must never be queryable from browser clients.
CREATE TABLE IF NOT EXISTS public.platform_payment_gateways (
  provider text NOT NULL CHECK (provider IN ('yo','iotec')),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  encrypted_credentials text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (provider,environment)
);
ALTER TABLE public.platform_payment_gateways ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_payment_gateways FROM PUBLIC, anon, authenticated;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.platform_payment_gateways TO service_role;
