-- Repair organisation location hierarchy relationships and sibling uniqueness.

BEGIN;

-- Declare geography relationships so PostgREST can resolve nested geo_places selects.
DO $$ BEGIN
  ALTER TABLE public.locations
    ADD CONSTRAINT locations_geo_place_id_fkey
    FOREIGN KEY (geo_place_id) REFERENCES public.geo_places(geoname_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.assets
    ADD CONSTRAINT assets_geo_place_id_fkey
    FOREIGN KEY (geo_place_id) REFERENCES public.geo_places(geoname_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.asset_location_events
    ADD CONSTRAINT asset_location_events_geo_place_id_fkey
    FOREIGN KEY (geo_place_id) REFERENCES public.geo_places(geoname_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Location names should be unique within the same branch/parent, not across the whole tenant.
DROP INDEX IF EXISTS public.locations_tenant_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS locations_sibling_name_key
ON public.locations(
  tenant_id,
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

NOTIFY pgrst, 'reload schema';
COMMIT;
