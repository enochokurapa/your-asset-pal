-- Public statistics are aggregated on the server. Only platform administrators can edit labels and overrides.
CREATE TABLE IF NOT EXISTS public.platform_public_stats (
 metric_key text PRIMARY KEY CHECK (metric_key IN ('assets','companies','locations','verifications')),
 label text NOT NULL CHECK (char_length(label) BETWEEN 3 AND 55),
 source text NOT NULL DEFAULT 'live' CHECK (source IN ('live','manual')),
 manual_value bigint NOT NULL DEFAULT 0 CHECK (manual_value BETWEEN 0 AND 1000000000),
 is_visible boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100)
);
INSERT INTO public.platform_public_stats(metric_key,label,source,sort_order) VALUES
 ('assets','Assets managed','live',10),
 ('companies','Organisations','live',20),
 ('locations','Locations tracked','live',30),
 ('verifications','Verification checks','live',40)
ON CONFLICT (metric_key) DO NOTHING;
ALTER TABLE public.platform_public_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_public_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_public_stats TO service_role;
