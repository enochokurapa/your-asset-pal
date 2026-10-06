BEGIN;

SELECT set_config(
  'request.jwt.claim.sub',
  (
    SELECT p.id::text
    FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE t.name = 'PesaPal Uganda'
      AND p.tenant_role = 'tenant_admin'
      AND p.is_active = true
    ORDER BY p.created_at
    LIMIT 1
  ),
  true
);

ALTER TABLE public.assets DISABLE TRIGGER audit_assets;
ALTER TABLE public.assets DISABLE TRIGGER trg_audit_assets;
ALTER TABLE public.locations DISABLE TRIGGER trg_audit_locations;

CREATE TEMP TABLE _pesapal_geo_bridge ON COMMIT DROP AS
SELECT l.id, l.name, l.geo_place_id
FROM public.locations l
JOIN public.tenants t ON t.id = l.tenant_id
WHERE t.name = 'PesaPal Uganda'
  AND l.location_type = 'area'
  AND l.name IN ('Entebbe','Jinja','Kampala','Bugolobi','Kisoro','Mbale','Mbarara')
  AND l.geo_place_id IS NOT NULL;

UPDATE public.assets a
SET location_id = NULL
FROM _pesapal_geo_bridge b
WHERE a.location_id = b.id
  AND a.geo_place_id = b.geo_place_id;

UPDATE public.asset_location_events e
SET location_id = NULL
FROM _pesapal_geo_bridge b
WHERE e.location_id = b.id
  AND e.geo_place_id = b.geo_place_id;

UPDATE public.location_migration_map m
SET new_location_id = NULL,
    notes = trim(both ' ' from concat_ws(
      ' ',
      nullif(m.notes, ''),
      'Geographic bridge location removed after geo_place migration completed.'
    ))
FROM _pesapal_geo_bridge b
WHERE m.new_location_id = b.id;

DELETE FROM public.locations
WHERE id IN (SELECT id FROM _pesapal_geo_bridge);

ALTER TABLE public.assets ENABLE TRIGGER audit_assets;
ALTER TABLE public.assets ENABLE TRIGGER trg_audit_assets;
ALTER TABLE public.locations ENABLE TRIGGER trg_audit_locations;

INSERT INTO public.audit_log(
  tenant_id, user_id, action, entity_type, entity_id, details
)
SELECT
  t.id,
  auth.uid(),
  'migration_cleanup',
  'locations',
  t.id,
  jsonb_build_object(
    'summary', 'Removed obsolete geographic bridge locations from Organisation locations',
    'removed_names', ARRAY['Entebbe','Jinja','Kampala','Bugolobi','Kisoro','Mbale','Mbarara'],
    'asset_geography_preserved', true
  )
FROM public.tenants t
WHERE t.name = 'PesaPal Uganda';

COMMIT;
