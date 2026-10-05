-- Complete asset location history integration for Location Engine v2.
ALTER TABLE public.asset_location_events
  ADD COLUMN IF NOT EXISTS geo_place_id bigint;

CREATE INDEX IF NOT EXISTS idx_asset_location_events_geo
  ON public.asset_location_events(geo_place_id);

-- Backfill a migration event for assets converted from legacy locations.
INSERT INTO public.asset_location_events(
  tenant_id,asset_id,location_id,geo_place_id,country_code,latitude,longitude,
  gps_accuracy_m,source,event_type,notes,recorded_by,recorded_at
)
SELECT
  a.tenant_id,a.id,a.location_id,a.geo_place_id,'UG',NULL,NULL,NULL,
  'migration','migrated','Legacy location migrated to Location Engine v2.',NULL,now()
FROM public.assets a
JOIN public.tenants t ON t.id=a.tenant_id AND t.slug='default'
WHERE a.location_source='migration'
  AND NOT EXISTS (
    SELECT 1 FROM public.asset_location_events e
    WHERE e.asset_id=a.id AND e.event_type='migrated'
  );

NOTIFY pgrst, 'reload schema';
