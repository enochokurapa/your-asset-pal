CREATE OR REPLACE FUNCTION public.check_paid_asset_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE assigned_plan text; state text; expires timestamptz; base_capacity bigint; extra_capacity bigint; already bigint;
BEGIN
 SELECT plan_code,subscription_status,subscription_ends_at,purchased_extra_assets INTO assigned_plan,state,expires,extra_capacity
 FROM public.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF assigned_plan NOT IN ('starter','business','enterprise') OR state <> 'active' THEN RETURN NEW; END IF;
 IF expires IS NOT NULL AND expires<=now() THEN RETURN NEW; END IF;
 SELECT included_assets INTO base_capacity FROM public.saas_pricing_plans WHERE id=assigned_plan;
 IF base_capacity IS NULL THEN RAISE EXCEPTION 'Assigned asset plan not configured'; END IF;
 SELECT count(*) INTO already FROM public.assets WHERE tenant_id=NEW.tenant_id;
 IF already>=base_capacity+coalesce(extra_capacity,0) THEN
  RAISE EXCEPTION 'Asset plan limit reached (% assets). Purchase more asset capacity from Plan & Billing.',base_capacity+coalesce(extra_capacity,0);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_paid_asset_capacity() FROM PUBLIC;
DROP TRIGGER IF EXISTS zzzz_paid_asset_capacity ON public.assets;
CREATE TRIGGER zzzz_paid_asset_capacity BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.check_paid_asset_capacity();
