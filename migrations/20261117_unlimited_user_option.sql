ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS paid_users_unlimited boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.enforce_paid_active_user_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; cap integer; base integer; already integer;
BEGIN
 IF NEW.is_active IS DISTINCT FROM true OR NEW.is_saas_admin=true OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.is_active=true AND OLD.tenant_id=NEW.tenant_id THEN RETURN NEW; END IF;
 SELECT subscription_status,subscription_ends_at,plan_code,paid_user_limit_override,purchased_extra_users,paid_users_unlimited
 INTO t FROM public.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF t.subscription_status<>'active' OR (t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at<=now()) THEN RETURN NEW; END IF;
 IF t.paid_users_unlimited THEN RETURN NEW; END IF;
 IF t.paid_user_limit_override IS NOT NULL THEN
  cap=t.paid_user_limit_override;
 ELSIF t.plan_code IN ('starter','business','enterprise') THEN
  SELECT included_users INTO base FROM public.saas_pricing_plans WHERE id=t.plan_code;
  cap=coalesce(base,0)+coalesce(t.purchased_extra_users,0);
 ELSE
  SELECT included_paid_users INTO base FROM public.saas_settings WHERE id=true;
  cap=coalesce(base,0)+coalesce(t.purchased_extra_users,0);
 END IF;
 SELECT count(*) INTO already FROM public.profiles WHERE tenant_id=NEW.tenant_id
  AND is_active=true AND is_saas_admin=false AND id<>NEW.id;
 IF already>=cap THEN
  RAISE EXCEPTION 'Subscription permits only % active users. Deactivate an existing user or purchase additional seats.',cap;
 END IF;
 RETURN NEW;
END $$;
