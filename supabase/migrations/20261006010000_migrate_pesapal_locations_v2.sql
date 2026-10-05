-- One-time migration of the legacy PesaPal Uganda manual locations.
-- Requires Location Engine v2 and imported GeoNames data.

BEGIN;

CREATE TEMP TABLE _legacy_location_plan(
  old_name text PRIMARY KEY,
  new_name text NOT NULL,
  geoname_id bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _legacy_location_plan(old_name,new_name,geoname_id) VALUES
  ('Kampala','Kampala',232422),
  ('Bugolobi','Bugolobi',234548),
  ('Entebbee','Entebbe',233508),
  ('Jinja','Jinja',233114),
  ('Mbale','Mbale',229278),
  ('Kisoro','Kisoro',230993),
  ('Mbarara','Mbarara',229268);

CREATE TEMP TABLE _legacy_locations ON COMMIT DROP AS
SELECT
  l.id old_location_id,l.tenant_id,l.name old_name,l.address,l.parent_id old_parent_id,
  p.new_name,p.geoname_id
FROM public.locations l
JOIN public.tenants t ON t.id=l.tenant_id AND t.slug='default'
JOIN _legacy_location_plan p ON lower(p.old_name)=lower(l.name)
WHERE l.is_structured=false;

-- Free the workspace-level unique names without deleting the source records yet.
UPDATE public.locations l
SET name='__legacy__'||replace(l.id::text,'-','')||'__'||l.name,
    is_active=false
FROM _legacy_locations x
WHERE l.id=x.old_location_id;

INSERT INTO public.locations(
  tenant_id,name,address,parent_id,is_active,country_code,latitude,longitude,
  location_source,last_verified_at,last_verified_by,location_type,branch_id,
  geo_place_id,is_structured,legacy_source_id
)
SELECT
  x.tenant_id,x.new_name,x.address,NULL,true,'UG',g.latitude,g.longitude,
  'map',NULL,NULL,'area',NULL,g.geoname_id,true,x.old_location_id
FROM _legacy_locations x
JOIN public.geo_places g ON g.geoname_id=x.geoname_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations n
  WHERE n.tenant_id=x.tenant_id AND n.legacy_source_id=x.old_location_id
);

-- Preserve Kampala -> Bugolobi.
UPDATE public.locations bug
SET parent_id=kamp.id
FROM public.locations kamp
JOIN public.tenants t ON t.id=kamp.tenant_id AND t.slug='default'
WHERE bug.tenant_id=kamp.tenant_id
  AND bug.is_structured=true
  AND kamp.is_structured=true
  AND bug.legacy_source_id IS NOT NULL
  AND kamp.legacy_source_id IS NOT NULL
  AND bug.name='Bugolobi'
  AND kamp.name='Kampala';

INSERT INTO public.location_migration_map(
  tenant_id,old_location_id,new_location_id,old_name,matched_geo_place_id,
  migration_status,notes,migrated_at
)
SELECT
  x.tenant_id,x.old_location_id,n.id,x.old_name,n.geo_place_id,
  'migrated','Migrated from the legacy manual PesaPal location register to Location Engine v2.',now()
FROM _legacy_locations x
JOIN public.locations n ON n.tenant_id=x.tenant_id AND n.legacy_source_id=x.old_location_id
ON CONFLICT (tenant_id,old_location_id) DO UPDATE SET
  new_location_id=EXCLUDED.new_location_id,
  old_name=EXCLUDED.old_name,
  matched_geo_place_id=EXCLUDED.matched_geo_place_id,
  migration_status='migrated',
  notes=EXCLUDED.notes,
  migrated_at=now();

UPDATE public.assets a
SET location_id=m.new_location_id,
    geo_place_id=m.matched_geo_place_id,
    location_source='migration'
FROM public.location_migration_map m
WHERE a.tenant_id=m.tenant_id
  AND a.location_id=m.old_location_id
  AND m.new_location_id IS NOT NULL;

UPDATE public.asset_movements x SET from_location_id=m.new_location_id
FROM public.location_migration_map m
WHERE x.from_location_id=m.old_location_id AND m.new_location_id IS NOT NULL;
UPDATE public.asset_movements x SET to_location_id=m.new_location_id
FROM public.location_migration_map m
WHERE x.to_location_id=m.old_location_id AND m.new_location_id IS NOT NULL;
UPDATE public.asset_verifications x SET location_id=m.new_location_id
FROM public.location_migration_map m
WHERE x.location_id=m.old_location_id AND m.new_location_id IS NOT NULL;
UPDATE public.asset_location_events x SET location_id=m.new_location_id
FROM public.location_migration_map m
WHERE x.location_id=m.old_location_id AND m.new_location_id IS NOT NULL;
UPDATE public.gate_passes x SET destination_location_id=m.new_location_id
FROM public.location_migration_map m
WHERE x.destination_location_id=m.old_location_id AND m.new_location_id IS NOT NULL;

UPDATE public.locations child SET parent_id=m.new_location_id
FROM public.location_migration_map m
WHERE child.parent_id=m.old_location_id
  AND NOT EXISTS (SELECT 1 FROM _legacy_locations x WHERE x.old_location_id=child.id)
  AND m.new_location_id IS NOT NULL;

DELETE FROM public.locations old
USING public.location_migration_map m
WHERE old.id=m.old_location_id
  AND old.tenant_id=m.tenant_id
  AND m.new_location_id IS NOT NULL;

UPDATE public.location_migration_map SET migration_status='retired'
WHERE tenant_id=(SELECT id FROM public.tenants WHERE slug='default' LIMIT 1)
  AND new_location_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
