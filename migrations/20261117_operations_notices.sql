-- Operational campaigns + idempotent, retryable notification delivery.
CREATE TABLE IF NOT EXISTS public.platform_operations_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  created_by uuid,
  scope text NOT NULL CHECK (scope IN ('all','business','user','activation')),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  attachment_name text,
  attachment_mime text,
  attachment_data bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_operations_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.platform_operations_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  to_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS platform_operations_deliveries_pending_idx
 ON public.platform_operations_deliveries (next_attempt_at,created_at)
 WHERE status='pending';
ALTER TABLE public.platform_operations_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_operations_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_operations_campaigns FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.platform_operations_deliveries FROM PUBLIC,anon,authenticated;
