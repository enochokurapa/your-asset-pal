-- Non-disruptive policy extensions; NULL retains existing plan allowance.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS paid_asset_limit_override integer;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_paid_asset_limit_override_valid
 CHECK(paid_asset_limit_override IS NULL OR paid_asset_limit_override=-1 OR paid_asset_limit_override>=0) NOT VALID;
ALTER TABLE public.tenants VALIDATE CONSTRAINT tenants_paid_asset_limit_override_valid;
CREATE TABLE IF NOT EXISTS public.tenant_country_entitlements (
 id uuid primary key DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 country_code char(2) NOT NULL,
 payment_transaction_id uuid REFERENCES public.billing_transactions(id),
 price_paid numeric(18,2) NOT NULL CHECK(price_paid>=0),
 currency text NOT NULL DEFAULT 'UGX',
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,country_code)
);
CREATE TABLE IF NOT EXISTS public.tenant_country_quotes (
 id uuid primary key DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 country_code char(2) NOT NULL,
 base_country_price numeric(18,2) NOT NULL CHECK(base_country_price>0),
 quoted_price numeric(18,2) NOT NULL CHECK(quoted_price>0),
 currency text NOT NULL DEFAULT 'UGX',
 country_index integer NOT NULL CHECK(country_index>0),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','expired')),
 payment_transaction_id uuid REFERENCES public.billing_transactions(id),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 minutes'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_country_quotes_pending_idx ON public.tenant_country_quotes(tenant_id,status,expires_at);
ALTER TABLE public.tenant_country_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_country_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_country_entitlements FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.tenant_country_quotes FROM PUBLIC,anon,authenticated;
-- Do not grant entitlements from a client write: require verified payment or audited administrator override.
CREATE OR REPLACE FUNCTION public.country_addon_quote(p_base numeric,p_extra_index integer)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT round(p_base*CASE WHEN p_extra_index<=5 THEN 0.8 ELSE 0.5 END,2)
$$;
-- Enforce purchased countries even if someone bypasses the React settings form.
CREATE OR REPLACE FUNCTION public.validate_tenant_countries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE extra_country text;
BEGIN
 IF array_length(NEW.allowed_country_codes,1) IS NULL THEN RETURN NEW; END IF;
 IF array_length(NEW.allowed_country_codes,1)<=1 THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM unnest(NEW.allowed_country_codes) code GROUP BY code HAVING count(*)>1)
 THEN RAISE EXCEPTION 'A country cannot be selected more than once'; END IF;
 FOR extra_country IN SELECT unnest(NEW.allowed_country_codes) EXCEPT SELECT coalesce(NEW.default_country_code,'') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.tenant_country_entitlements e
    WHERE e.tenant_id=NEW.tenant_id AND e.country_code=extra_country
      AND e.ends_at>now()) THEN
    RAISE EXCEPTION 'Additional country % requires a paid country entitlement',extra_country;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_tenant_countries ON public.tenant_location_settings;
CREATE TRIGGER trg_validate_tenant_countries BEFORE INSERT OR UPDATE OF allowed_country_codes,default_country_code
ON public.tenant_location_settings FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_countries();
