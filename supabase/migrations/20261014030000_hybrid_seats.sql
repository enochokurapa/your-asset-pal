ALTER TABLE public.saas_settings
 ADD COLUMN IF NOT EXISTS included_paid_users integer NOT NULL DEFAULT 6 CHECK (included_paid_users BETWEEN 1 AND 100000),
 ADD COLUMN IF NOT EXISTS extra_user_price numeric(15,2) NOT NULL DEFAULT 0 CHECK (extra_user_price >= 0),
 ADD COLUMN IF NOT EXISTS included_assets integer NOT NULL DEFAULT 10000 CHECK (included_assets BETWEEN 1 AND 1000000000);
ALTER TABLE public.tenants
 ADD COLUMN IF NOT EXISTS purchased_extra_users integer NOT NULL DEFAULT 0 CHECK (purchased_extra_users BETWEEN 0 AND 100000),
 ADD COLUMN IF NOT EXISTS paid_user_limit_override integer CHECK (paid_user_limit_override BETWEEN 1 AND 100000);
CREATE TABLE IF NOT EXISTS public.seat_purchase_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 unit_price numeric(15,2) NOT NULL CHECK(unit_price>=0),
 amount numeric(15,2) NOT NULL CHECK(amount>0),
 currency text NOT NULL,
 phone text NOT NULL,
 provider_reference text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','successful','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seat_purchase_tenant_idx ON public.seat_purchase_transactions(tenant_id,created_at DESC);
ALTER TABLE public.seat_purchase_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seat_purchase_transactions FROM anon,authenticated;
GRANT ALL ON public.seat_purchase_transactions TO service_role;
CREATE OR REPLACE FUNCTION public.activate_seat_purchase(p_id uuid,p_tenant uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q integer; BEGIN
 SELECT quantity INTO q FROM public.seat_purchase_transactions WHERE id=p_id AND tenant_id=p_tenant AND status='pending' FOR UPDATE;
 IF q IS NULL THEN RETURN 0; END IF;
 UPDATE public.seat_purchase_transactions SET status='successful',updated_at=now() WHERE id=p_id;
 UPDATE public.tenants SET purchased_extra_users=purchased_extra_users+q WHERE id=p_tenant;
 RETURN q;
END $$;
REVOKE ALL ON FUNCTION public.activate_seat_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_seat_purchase(uuid,uuid) TO service_role;
