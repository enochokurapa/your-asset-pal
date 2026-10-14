ALTER TABLE public.saas_settings ADD COLUMN IF NOT EXISTS extra_asset_block_size integer NOT NULL DEFAULT 2000 CHECK(extra_asset_block_size>=1), ADD COLUMN IF NOT EXISTS extra_asset_block_price numeric(15,2) NOT NULL DEFAULT 20 CHECK(extra_asset_block_price>=0);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS purchased_extra_assets integer NOT NULL DEFAULT 0 CHECK(purchased_extra_assets>=0);
CREATE TABLE IF NOT EXISTS public.asset_capacity_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id), blocks integer NOT NULL CHECK(blocks BETWEEN 1 AND 100),
 block_size integer NOT NULL CHECK(block_size>0), unit_price numeric(15,2) NOT NULL CHECK(unit_price>=0),
 amount numeric(15,2) NOT NULL CHECK(amount>0), currency text NOT NULL, phone text NOT NULL,
 provider_reference text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','successful','failed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_capacity_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_capacity_purchases FROM anon,authenticated;
GRANT ALL ON public.asset_capacity_purchases TO service_role;
CREATE OR REPLACE FUNCTION public.activate_asset_capacity_purchase(p_id uuid,p_tenant uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seats integer;
BEGIN
 SELECT blocks*block_size INTO seats FROM public.asset_capacity_purchases WHERE id=p_id AND tenant_id=p_tenant AND status='pending' FOR UPDATE;
 IF seats IS NULL THEN RETURN 0; END IF;
 UPDATE public.asset_capacity_purchases SET status='successful' WHERE id=p_id;
 UPDATE public.tenants SET purchased_extra_assets=purchased_extra_assets+seats WHERE id=p_tenant;
 RETURN seats;
END $$;
REVOKE ALL ON FUNCTION public.activate_asset_capacity_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_asset_capacity_purchase(uuid,uuid) TO service_role;
ALTER TABLE public.saas_pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published pricing plans" ON public.saas_pricing_plans FOR SELECT TO authenticated USING (is_published);
GRANT SELECT ON public.saas_pricing_plans TO authenticated;
