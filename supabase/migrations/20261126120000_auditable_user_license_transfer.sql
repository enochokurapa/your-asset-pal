BEGIN;

-- Append-only ledger, deliberately independent of the clearable general audit log.
CREATE TABLE public.user_license_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 actor_id uuid NOT NULL,
 actor_name text NOT NULL,
 support_session_id uuid REFERENCES public.platform_tenant_access_sessions(id),
 source_user_id uuid NOT NULL,
 source_name text NOT NULL,
 source_email text NOT NULL,
 target_user_id uuid NOT NULL,
 target_name text NOT NULL,
 target_email text NOT NULL,
 target_role public.app_role NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),
 seats_before integer NOT NULL CHECK(seats_before>=1),
 seats_after integer NOT NULL CHECK(seats_after=seats_before),
 seat_limit integer CHECK(seat_limit IS NULL OR seat_limit>=seats_after),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_user_id<>target_user_id)
);
CREATE INDEX user_license_events_tenant_time ON public.user_license_events(tenant_id,created_at DESC);
ALTER TABLE public.user_license_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_license_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reject_user_license_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'License transaction history is immutable'; END;
$$;
CREATE TRIGGER user_license_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
 ON public.user_license_events FOR EACH STATEMENT EXECUTE FUNCTION public.reject_user_license_event_mutation();
REVOKE ALL ON FUNCTION public.reject_user_license_event_mutation() FROM PUBLIC,anon,authenticated,service_role;

-- One capacity definition. NULL is unlimited, not zero.
-- Override is the total entitlement; extra seats are added only to a base plan.
CREATE FUNCTION public.user_seat_capacity(p_tenant uuid)
RETURNS TABLE(seat_limit integer,subscription_valid boolean)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE t public.tenants%ROWTYPE; s public.saas_settings%ROWTYPE; base integer;
BEGIN
 SELECT * INTO STRICT t FROM public.tenants WHERE id=p_tenant;
 SELECT * INTO STRICT s FROM public.saas_settings WHERE id=true;
 IF t.subscription_status='trial' THEN
  seat_limit:=coalesce(t.trial_user_limit_override,s.trial_user_limit);
  subscription_valid:=coalesce(t.trial_ends_at>now(),false);
 ELSE
  subscription_valid:=coalesce(t.subscription_status='active' AND (t.subscription_ends_at IS NULL OR t.subscription_ends_at>now()),false);
  IF t.paid_users_unlimited OR t.paid_user_limit_override=-1 THEN seat_limit:=NULL;
  ELSIF t.paid_user_limit_override IS NOT NULL THEN seat_limit:=t.paid_user_limit_override;
  ELSE
   IF t.plan_code IN ('starter','business','enterprise') THEN
    SELECT included_users INTO STRICT base FROM public.saas_pricing_plans WHERE id=t.plan_code;
   ELSE base:=s.included_paid_users; END IF;
   seat_limit:=base+coalesce(t.purchased_extra_users,0);
  END IF;
 END IF;
 IF seat_limit<0 OR (seat_limit IS NULL AND t.subscription_status='trial') THEN
  RAISE EXCEPTION 'Invalid subscription seat entitlement';
 END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.user_seat_capacity(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Retain the previous paid trigger's behaviour for non-active subscriptions;
-- additionally enforce valid trials at the database layer. Existing signup/
-- provisioning flows may attach an initial account before plan activation.
CREATE OR REPLACE FUNCTION public.enforce_paid_active_user_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cap integer; valid boolean; used integer;
BEGIN
 IF NEW.is_active IS DISTINCT FROM true OR NEW.is_saas_admin=true OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.is_active=true AND OLD.tenant_id=NEW.tenant_id AND OLD.is_saas_admin=false THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM public.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 SELECT c.seat_limit,c.subscription_valid INTO cap,valid FROM public.user_seat_capacity(NEW.tenant_id) c;
 IF NOT valid OR cap IS NULL THEN RETURN NEW; END IF;
 SELECT count(*) INTO used FROM public.profiles
 WHERE tenant_id=NEW.tenant_id AND is_active=true AND is_saas_admin=false AND id<>NEW.id;
 IF used>=cap THEN RAISE EXCEPTION 'Subscription permits only % active users. Deactivate a user or purchase additional seats.',cap; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_paid_active_user_cap ON public.profiles;
CREATE TRIGGER trg_enforce_paid_active_user_cap BEFORE INSERT OR UPDATE OF is_active,tenant_id,is_saas_admin
 ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_active_user_cap();

-- The service stages a NEW banned authentication account before invoking this
-- invoker-rights function on the trusted PostgreSQL connection. No API role can execute it.
-- All entitlement, access and ledger changes are a single database transaction.
CREATE FUNCTION public.transfer_user_license(
 p_tenant uuid,p_actor uuid,p_support uuid,p_source uuid,p_target uuid,
 p_role public.app_role,p_reason text,p_request uuid
) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE
 actor public.profiles%ROWTYPE; src public.profiles%ROWTYPE; dst public.profiles%ROWTYPE;
 cap integer; valid boolean; before_count integer; after_count integer;
 event_id uuid; existing public.user_license_events%ROWTYPE;
BEGIN
 IF p_actor=p_source OR p_source=p_target OR p_actor=p_target THEN
  RAISE EXCEPTION 'Cannot transfer your own license or transfer to the same account';
 END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'A transfer reason is required'; END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found'; END IF;

 -- Verify the actor again while holding the workspace lock.
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR actor.is_active IS DISTINCT FROM true OR actor.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Active administrator required'; END IF;
 IF actor.is_saas_admin THEN
  PERFORM 1 FROM public.platform_tenant_access_sessions
   WHERE id=p_support AND tenant_id=p_tenant AND administrator_id=p_actor
   AND ended_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An authorized business support session is required'; END IF;
 ELSE
  IF p_support IS NOT NULL OR actor.tenant_id IS DISTINCT FROM p_tenant OR
     (actor.tenant_role IS DISTINCT FROM 'tenant_admin' AND NOT EXISTS(
       SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin'))
  THEN RAISE EXCEPTION 'Workspace administrator required'; END IF;
 END IF;

 SELECT * INTO existing FROM public.user_license_events WHERE request_id=p_request;
 IF FOUND THEN
  IF existing.tenant_id<>p_tenant OR existing.actor_id<>p_actor OR
     existing.source_user_id<>p_source OR existing.target_user_id<>p_target OR
     existing.target_role<>p_role OR existing.reason<>btrim(p_reason)
  THEN RAISE EXCEPTION 'Transfer request already used'; END IF;
  RETURN existing.id;
 END IF;
 SELECT * INTO src FROM public.profiles WHERE id=p_source FOR UPDATE;
 IF NOT FOUND OR src.tenant_id IS DISTINCT FROM p_tenant OR src.is_active IS DISTINCT FROM true
    OR src.is_saas_admin OR src.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'Select an active user in this workspace';
 END IF;
 SELECT * INTO dst FROM public.profiles WHERE id=p_target FOR UPDATE;
 IF NOT FOUND OR dst.tenant_id IS NOT NULL OR dst.is_saas_admin OR dst.archived_at IS NOT NULL
 THEN RAISE EXCEPTION 'Replacement account is not an unassigned new user'; END IF;
 PERFORM 1 FROM auth.users WHERE id=p_target AND banned_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Replacement account was not securely prepared'; END IF;
 PERFORM 1 FROM auth.users WHERE id=p_source FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Departing authentication account not found'; END IF;

 SELECT c.seat_limit,c.subscription_valid INTO cap,valid FROM public.user_seat_capacity(p_tenant) c;
 IF NOT valid THEN RAISE EXCEPTION 'Renew or activate the subscription before transferring seats'; END IF;
 SELECT count(*) INTO before_count FROM public.profiles WHERE tenant_id=p_tenant AND is_active=true AND is_saas_admin=false;
 IF cap IS NOT NULL AND before_count>cap THEN RAISE EXCEPTION 'Workspace exceeds its seat entitlement'; END IF;
 IF p_role<>'admin' AND NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.tenant_id=p_tenant AND p.id<>p_source AND p.is_active=true
   AND p.is_saas_admin=false AND p.archived_at IS NULL AND
   (p.tenant_role='tenant_admin' OR EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin'))
 ) THEN RAISE EXCEPTION 'The workspace must retain an active administrator'; END IF;

 -- Release the old seat without deleting the account or any associated asset history.
 UPDATE public.profiles SET is_active=false WHERE id=p_source;
 UPDATE auth.users SET banned_until=now()+interval '100 years',updated_at=now() WHERE id=p_source;
 DELETE FROM auth.sessions WHERE user_id=p_source;
 UPDATE public.platform_mfa_trusted_devices SET revoked_at=now() WHERE user_id=p_source AND revoked_at IS NULL;

 -- New employee receives an independent identity and only the selected base role.
 DELETE FROM public.user_roles WHERE user_id=p_target;
 INSERT INTO public.user_roles(user_id,role) VALUES(p_target,p_role);
 UPDATE public.profiles SET tenant_id=p_tenant,tenant_role=CASE WHEN p_role='admin' THEN 'tenant_admin' ELSE 'member' END,
  is_active=true,must_change_password=true WHERE id=p_target;
 DELETE FROM auth.sessions WHERE user_id=p_target;
 UPDATE auth.users SET banned_until=NULL,updated_at=now() WHERE id=p_target;
 SELECT count(*) INTO after_count FROM public.profiles WHERE tenant_id=p_tenant AND is_active=true AND is_saas_admin=false;
 IF after_count<>before_count OR (cap IS NOT NULL AND after_count>cap) THEN RAISE EXCEPTION 'Seat count changed during transfer'; END IF;

 INSERT INTO public.user_license_events(request_id,tenant_id,actor_id,actor_name,support_session_id,
  source_user_id,source_name,source_email,target_user_id,target_name,target_email,target_role,reason,seats_before,seats_after,seat_limit)
 VALUES(p_request,p_tenant,p_actor,coalesce(actor.full_name,actor.email,'Administrator'),p_support,
  p_source,coalesce(src.full_name,src.email,'User'),coalesce(src.email,''),p_target,coalesce(dst.full_name,dst.email,'User'),coalesce(dst.email,''),
  p_role,btrim(p_reason),before_count,after_count,cap) RETURNING id INTO event_id;
 IF p_support IS NOT NULL THEN
  INSERT INTO public.platform_tenant_security_events(session_id,tenant_id,actor_id,action,details)
  VALUES(p_support,p_tenant,p_actor,'tenant_user_license_transferred',jsonb_build_object('eventId',event_id,'sourceUserId',p_source,'targetUserId',p_target));
 END IF;
 RETURN event_id;
END $$;
REVOKE ALL ON FUNCTION public.transfer_user_license(uuid,uuid,uuid,uuid,uuid,public.app_role,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Retained JWTs must no longer resolve to a tenant after deactivation.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=true AND p.archived_at IS NULL)
 THEN COALESCE(public.current_platform_support_tenant_id(),(SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid())) ELSE NULL END;
$$;
COMMIT;
