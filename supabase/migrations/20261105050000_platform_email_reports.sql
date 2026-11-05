-- Global SaaS-admin report schedule and idempotent delivery records.
CREATE TABLE IF NOT EXISTS public.platform_email_report_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id=true),
 enabled boolean NOT NULL DEFAULT false,
 frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily','monthly')),
 send_hour integer NOT NULL DEFAULT 6 CHECK (send_hour BETWEEN 0 AND 23),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id)
);
INSERT INTO public.platform_email_report_settings(id,enabled,frequency,send_hour)
VALUES (true,false,'monthly',6) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_email_report_deliveries (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 frequency text NOT NULL CHECK (frequency IN ('daily','monthly')),
 period_key text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,frequency,period_key)
);
ALTER TABLE public.platform_email_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_email_report_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_email_report_settings,public.platform_email_report_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.platform_email_report_settings,public.platform_email_report_deliveries TO service_role;
