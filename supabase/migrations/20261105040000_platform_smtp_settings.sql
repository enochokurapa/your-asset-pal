-- SaaS-only SMTP configuration. Public/tenant clients have zero access.
-- The administrator-facing server encrypts this document using AES-256-GCM.
CREATE TABLE IF NOT EXISTS public.platform_smtp_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  encrypted_config text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.platform_smtp_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_smtp_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_smtp_settings TO service_role;
