CREATE TABLE IF NOT EXISTS public.platform_contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  email text NOT NULL CHECK(length(email) BETWEEN 5 AND 254),
  subject text NOT NULL CHECK(length(subject) BETWEEN 5 AND 180),
  message text NOT NULL CHECK(length(message) BETWEEN 10 AND 6000),
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','waiting_for_customer','resolved','closed')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS platform_contact_email_recent_idx ON public.platform_contact_requests(email,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_contact_status_idx ON public.platform_contact_requests(status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.platform_contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.platform_contact_requests(id) ON DELETE CASCADE,
  admin_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL CHECK(length(body) BETWEEN 2 AND 6000),
  subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 180),
  delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sending','sent','failed')),
  delivered_at timestamptz,
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_contact_messages_request_idx ON public.platform_contact_messages(request_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.platform_contact_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 90),
  subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 180),
  body text NOT NULL CHECK(length(body) BETWEEN 10 AND 6000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_contact_templates(title,subject,body)
SELECT title,subject,body FROM (VALUES
  ('Acknowledgement','Re: {{subject}}','Hello {{name}},\n\nThank you for contacting AssetFlow 360. We have received your message and are reviewing it.\n\nRegards,\nAssetFlow Support'),
  ('Information requested','Re: {{subject}}','Hello {{name}},\n\nThank you for your interest in AssetFlow 360. To assist you further, please provide the following information:\n\n\n\nRegards,\nAssetFlow Support'),
  ('Resolved','Re: {{subject}}','Hello {{name}},\n\nWe have reviewed your request and believe it has been resolved. Please reply to this email if you need further assistance.\n\nRegards,\nAssetFlow Support')
) AS defaults(title,subject,body)
WHERE NOT EXISTS(SELECT 1 FROM public.platform_contact_templates);
ALTER TABLE public.platform_contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_contact_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_contact_requests,public.platform_contact_messages,public.platform_contact_templates FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_contact_requests,public.platform_contact_messages,public.platform_contact_templates TO service_role;
