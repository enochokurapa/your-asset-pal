-- Only SaaS administrators manage official contact and social destinations.
CREATE TABLE IF NOT EXISTS public.platform_social_links (
  platform text PRIMARY KEY CHECK (platform IN
    ('whatsapp','facebook','instagram','linkedin','x','youtube','tiktok','telegram')),
  url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_social_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_social_links FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_social_links TO service_role;
INSERT INTO public.platform_social_links(platform,sort_order)
VALUES ('whatsapp',0),('facebook',10),('instagram',20),('linkedin',30),
       ('x',40),('youtube',50),('tiktok',60),('telegram',70)
ON CONFLICT(platform) DO NOTHING;
COMMENT ON TABLE public.platform_social_links IS
 'Official SaaS-managed public social destinations; WhatsApp URL is derived from a validated number.';
