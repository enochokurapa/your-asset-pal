-- Disposable PostgreSQL only. This is a minimal schema fixture, not production data.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.current_platform_support_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','manager','staff','security');
CREATE TABLE public.tenants(id uuid PRIMARY KEY,subscription_status text,trial_ends_at timestamptz,trial_user_limit_override integer,subscription_ends_at timestamptz,paid_users_unlimited boolean DEFAULT false,paid_user_limit_override integer,plan_code text,purchased_extra_users integer DEFAULT 0);
CREATE TABLE public.saas_settings(id boolean PRIMARY KEY,trial_user_limit integer,included_paid_users integer);
CREATE TABLE public.saas_pricing_plans(id text PRIMARY KEY,included_users integer);
CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),tenant_id uuid REFERENCES public.tenants(id),tenant_role text DEFAULT 'member',is_active boolean DEFAULT true,is_saas_admin boolean DEFAULT false,archived_at timestamptz,must_change_password boolean DEFAULT false,full_name text,email text);
CREATE TABLE public.user_roles(user_id uuid REFERENCES public.profiles(id),role public.app_role,PRIMARY KEY(user_id,role));
CREATE TABLE auth.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id));
CREATE TABLE public.platform_mfa_trusted_devices(user_id uuid REFERENCES auth.users(id),revoked_at timestamptz);
CREATE TABLE public.platform_tenant_access_sessions(id uuid PRIMARY KEY,tenant_id uuid,administrator_id uuid,ended_at timestamptz,expires_at timestamptz);
CREATE TABLE public.platform_tenant_security_events(session_id uuid,tenant_id uuid,actor_id uuid,action text,details jsonb);
INSERT INTO public.saas_settings VALUES(true,2,4);
INSERT INTO public.saas_pricing_plans VALUES('starter',4);
INSERT INTO public.tenants(id,subscription_status,plan_code,paid_user_limit_override) VALUES
('10000000-0000-4000-8000-000000000001','active','starter',4),
('10000000-0000-4000-8000-000000000002','active','starter',4);
INSERT INTO auth.users(id,banned_until) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n>=6 THEN now()+interval '1 year' END FROM generate_series(1,9) n;
INSERT INTO public.profiles(id,tenant_id,tenant_role,full_name,email) SELECT id, CASE WHEN substring(id::text from 25)::int<=4 THEN '10000000-0000-4000-8000-000000000001'::uuid WHEN substring(id::text from 25)::int=5 THEN '10000000-0000-4000-8000-000000000002'::uuid END, CASE WHEN substring(id::text from 25)::int=1 THEN 'tenant_admin' ELSE 'member' END,id::text,id::text||'@example.invalid' FROM auth.users;
INSERT INTO public.user_roles SELECT id,CASE WHEN tenant_role='tenant_admin' THEN 'admin'::public.app_role ELSE 'staff'::public.app_role END FROM public.profiles;
INSERT INTO auth.sessions(user_id) SELECT id FROM auth.users;
INSERT INTO public.platform_mfa_trusted_devices(user_id) SELECT id FROM auth.users;
