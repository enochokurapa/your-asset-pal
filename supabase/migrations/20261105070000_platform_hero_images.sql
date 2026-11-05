-- Public marketing hero artwork is managed exclusively by active SaaS administrators.
-- Asset bytes are base64 inside the row because R2 availability is not a
-- prerequisite for public marketing imagery. This also avoids external URLs.
CREATE TABLE IF NOT EXISTS public.platform_hero_images (
  page text PRIMARY KEY CHECK (page IN ('home','features','solutions','pricing','about')),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/webp','image/svg+xml')),
  image_base64 text NOT NULL,
  width integer NOT NULL CHECK (width BETWEEN 1280 AND 3840),
  height integer NOT NULL CHECK (height BETWEEN 600 AND 2400),
  alt_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.platform_hero_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_hero_images FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_hero_images TO service_role;
COMMENT ON TABLE public.platform_hero_images IS 'Platform-global hero art, not tenant branding. SaaS admins write via validated server functions; public readers use a server-only service role.';
NOTIFY pgrst, 'reload schema';
