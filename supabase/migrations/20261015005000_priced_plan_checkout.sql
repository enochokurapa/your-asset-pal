ALTER TABLE public.billing_transactions
 ADD COLUMN IF NOT EXISTS plan_code text CHECK(plan_code IS NULL OR plan_code IN ('starter','business','enterprise')),
 ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly' CHECK(billing_period IN ('monthly','annual'));
CREATE OR REPLACE FUNCTION public.activate_paid_plan_transaction(p_id uuid,p_tenant uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx record; plan text; term text; next_expiration timestamptz;
BEGIN
 SELECT id,status,plan_code,billing_period INTO tx FROM public.billing_transactions WHERE id=p_id AND tenant_id=p_tenant AND module_key IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription payment was not found'; END IF;
 IF tx.status='successful' THEN RETURN false; END IF;
 IF tx.status<>'pending' THEN RAISE EXCEPTION 'Subscription payment is not pending'; END IF;
 plan:=coalesce(tx.plan_code,'paid');term:=coalesce(tx.billing_period,'monthly');
 next_expiration:=CASE WHEN term='annual' THEN now()+interval '1 year' ELSE now()+interval '1 month' END;
 UPDATE public.billing_transactions SET status='successful',updated_at=now() WHERE id=p_id;
 UPDATE public.tenants SET subscription_status='active',plan_code=plan,
 subscription_started_at=now(),subscription_ends_at=next_expiration,updated_at=now() WHERE id=p_tenant;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.activate_paid_plan_transaction(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_plan_transaction(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
