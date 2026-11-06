-- Remove visitor counters from public statistics configuration.
-- Historical legacy aggregate events remain archived, without active collectors.
-- All future visitor acquisition metrics come from authorised external analytics.
DELETE FROM public.platform_public_stats WHERE metric_key IN ('site_visits','app_visits');
