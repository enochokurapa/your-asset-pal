-- Administrator-managed public website links. No access from tenant/anonymous SQL roles.
CREATE TABLE IF NOT EXISTS public.platform_important_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  url text NOT NULL CHECK (char_length(url) BETWEEN 12 AND 500),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 180),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_important_links_visible
  ON public.platform_important_links (is_active, sort_order, created_at);
ALTER TABLE public.platform_important_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_important_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_important_links TO service_role;
