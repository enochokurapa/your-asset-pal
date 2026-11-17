ALTER TABLE public.tenant_country_quotes ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.tenant_country_quotes ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.tenant_country_quotes ADD COLUMN IF NOT EXISTS provider_reference text;
ALTER TABLE public.tenant_country_quotes ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
CREATE OR REPLACE FUNCTION public.activate_verified_country_purchase(p_id uuid,p_tenant uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.tenant_country_quotes%ROWTYPE; subscription_end timestamptz;
BEGIN
 SELECT * INTO q FROM public.tenant_country_quotes WHERE id=p_id AND tenant_id=p_tenant FOR UPDATE;
 IF q.id IS NULL THEN RAISE EXCEPTION 'Country purchase not found'; END IF;
 IF q.status='paid' THEN RETURN false; END IF;
 IF q.status<>'pending' OR q.provider_reference IS NULL THEN RAISE EXCEPTION 'Country payment not pending'; END IF;
 SELECT subscription_ends_at INTO subscription_end FROM public.tenants
  WHERE id=p_tenant AND subscription_status='active' FOR UPDATE;
 IF subscription_end IS NULL OR subscription_end<=now() THEN RAISE EXCEPTION 'Base subscription inactive'; END IF;
 IF EXISTS(SELECT 1 FROM public.tenant_country_entitlements
  WHERE tenant_id=p_tenant AND country_code=q.country_code AND ends_at>now())
 THEN RAISE EXCEPTION 'Country already purchased'; END IF;
 INSERT INTO public.tenant_country_entitlements(
  tenant_id,country_code,price_paid,currency,starts_at,ends_at)
 VALUES(p_tenant,q.country_code,q.quoted_price,'UGX',now(),subscription_end)
 ON CONFLICT(tenant_id,country_code) DO UPDATE SET price_paid=EXCLUDED.price_paid,
  starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at;
 UPDATE public.tenant_country_quotes SET status='paid',confirmed_at=now() WHERE id=q.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.activate_verified_country_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated;
