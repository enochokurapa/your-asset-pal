CREATE OR REPLACE FUNCTION public.check_paid_asset_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE assigned_plan text; state text; expires timestamptz;
 base_capacity bigint; extra_capacity bigint; already bigint; override_capacity bigint;
BEGIN
 SELECT plan_code,subscription_status,subscription_ends_at,purchased_extra_assets,paid_asset_limit_override
 INTO assigned_plan,state,expires,extra_capacity,override_capacity
 FROM public.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF state <> 'active' OR (expires IS NOT NULL AND expires<=now()) THEN RETURN NEW; END IF;
 IF override_capacity = -1 THEN RETURN NEW; END IF;
 IF override_capacity IS NOT NULL THEN
  base_capacity:=override_capacity;extra_capacity:=0;
 ELSIF assigned_plan IN ('starter','business','enterprise') THEN
  SELECT included_assets INTO base_capacity FROM public.saas_pricing_plans WHERE id=assigned_plan;
  IF base_capacity IS NULL THEN RAISE EXCEPTION 'Assigned asset plan not configured'; END IF;
 ELSE RETURN NEW;
 END IF;
 SELECT count(*) INTO already FROM public.assets WHERE tenant_id=NEW.tenant_id;
 IF already>=base_capacity+coalesce(extra_capacity,0) THEN
  RAISE EXCEPTION 'Asset subscription allows % assets. Request more asset capacity from your administrator.',base_capacity+coalesce(extra_capacity,0);
 END IF;
 RETURN NEW;
END $$;
