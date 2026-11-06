-- Hybrid statistics add only new live records since the administrator captured a baseline.
ALTER TABLE public.platform_public_stats
  ADD COLUMN IF NOT EXISTS live_anchor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anchor_recorded_at timestamptz;
ALTER TABLE public.platform_public_stats
  DROP CONSTRAINT IF EXISTS platform_public_stats_source_check;
ALTER TABLE public.platform_public_stats
  ADD CONSTRAINT platform_public_stats_source_check CHECK (source IN ('live','manual','hybrid'));
ALTER TABLE public.platform_public_stats
  DROP CONSTRAINT IF EXISTS custom_stats_are_manual;
ALTER TABLE public.platform_public_stats
  ADD CONSTRAINT custom_stats_are_manual CHECK (
    source='manual' OR metric_key IN ('assets','companies','locations','verifications','site_visits','app_visits')
  );
-- Counters deliberately represent page views, not deduplicated unique humans.
CREATE TABLE IF NOT EXISTS public.platform_page_view_daily (
  day date NOT NULL,
  area text NOT NULL CHECK (area IN ('website','application')),
  source text NOT NULL CHECK (source IN ('direct','search','social','referral','campaign','internal')),
  page text NOT NULL CHECK (char_length(page) BETWEEN 1 AND 90),
  views bigint NOT NULL DEFAULT 0 CHECK (views BETWEEN 0 AND 1000000000),
  PRIMARY KEY(day,area,source,page)
);
CREATE INDEX IF NOT EXISTS platform_page_view_day_idx ON public.platform_page_view_daily(day DESC);
ALTER TABLE public.platform_page_view_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_page_view_daily FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_page_view_daily TO service_role;
INSERT INTO public.platform_public_stats(metric_key,label,source,sort_order)
VALUES ('site_visits','Website page views','live',50),
       ('app_visits','Application page views','live',60)
ON CONFLICT(metric_key) DO NOTHING;
