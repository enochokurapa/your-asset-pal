-- AssetFlow 360 location engine v2
-- Separates global geography, organisation locations, tenant defaults and asset position.

BEGIN;

CREATE TABLE IF NOT EXISTS public.geo_countries (
  code char(2) PRIMARY KEY,
  name text NOT NULL,
  geoname_id bigint,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'geonames',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.geo_places (
  geoname_id bigint PRIMARY KEY,
  country_code char(2) NOT NULL REFERENCES public.geo_countries(code) ON DELETE CASCADE,
  parent_geoname_id bigint,
  name text NOT NULL,
  ascii_name text,
  feature_class char(1) NOT NULL,
  feature_code text NOT NULL,
  admin_level smallint,
  admin1_code text,
  admin2_code text,
  admin3_code text,
  admin4_code text,
  latitude double precision,
  longitude double precision,
  population bigint,
  timezone text,
  source text NOT NULL DEFAULT 'geonames',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_places_country_parent ON public.geo_places(country_code,parent_geoname_id);
CREATE INDEX IF NOT EXISTS idx_geo_places_country_level ON public.geo_places(country_code,admin_level);
CREATE INDEX IF NOT EXISTS idx_geo_places_name_lower ON public.geo_places(country_code,lower(name));
CREATE INDEX IF NOT EXISTS idx_geo_places_feature ON public.geo_places(country_code,feature_class,feature_code);

INSERT INTO public.geo_countries(code,name,geoname_id) VALUES
  ('UG','Uganda',226074),
  ('KE','Kenya',192950),
  ('TZ','Tanzania',149590),
  ('RW','Rwanda',49518),
  ('ZM','Zambia',895949),
  ('MW','Malawi',927384),
  ('ZW','Zimbabwe',878675)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,geoname_id=EXCLUDED.geoname_id,enabled=true,updated_at=now();

CREATE TABLE IF NOT EXISTS public.tenant_location_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_mode text NOT NULL DEFAULT 'hybrid'
    CHECK (location_mode IN ('internal','branch','geographic','hybrid')),
  default_country_code char(2) REFERENCES public.geo_countries(code),
  default_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  require_branch boolean NOT NULL DEFAULT false,
  require_geography boolean NOT NULL DEFAULT false,
  require_internal_location boolean NOT NULL DEFAULT false,
  require_gps boolean NOT NULL DEFAULT false,
  allow_custom_area boolean NOT NULL DEFAULT true,
  allow_inline_location_create boolean NOT NULL DEFAULT true,
  remember_last_selection boolean NOT NULL DEFAULT true,
  show_coordinates boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS geo_place_id bigint,
  ADD COLUMN IF NOT EXISTS is_structured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_source_id uuid;

DO $$ BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT locations_location_type_check
  CHECK (location_type IN ('site','branch','building','floor','department','office','room','store','warehouse','archive','field_site','area','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_locations_geo_place ON public.locations(geo_place_id);
CREATE INDEX IF NOT EXISTS idx_locations_branch ON public.locations(branch_id);

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS geo_place_id bigint,
  ADD COLUMN IF NOT EXISTS location_latitude double precision,
  ADD COLUMN IF NOT EXISTS location_longitude double precision,
  ADD COLUMN IF NOT EXISTS location_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS location_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS location_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.assets ADD CONSTRAINT assets_location_source_check
  CHECK (location_source IN ('manual','device_gps','map','api','import','live_tracking','migration'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_assets_geo_place ON public.assets(geo_place_id);

CREATE TABLE IF NOT EXISTS public.location_migration_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  old_location_id uuid NOT NULL,
  new_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  old_name text NOT NULL,
  matched_geo_place_id bigint,
  migration_status text NOT NULL DEFAULT 'pending'
    CHECK (migration_status IN ('pending','migrated','review','retired')),
  notes text,
  migrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,old_location_id)
);

CREATE TABLE IF NOT EXISTS public.tracking_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_device_id text NOT NULL,
  label text,
  device_type text,
  is_active boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,provider,external_device_id)
);

CREATE TABLE IF NOT EXISTS public.tracking_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.tracking_devices(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision,
  speed_kph double precision,
  heading_degrees double precision,
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_asset_time ON public.tracking_events(asset_id,recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_device_time ON public.tracking_events(device_id,recorded_at DESC);

ALTER TABLE public.geo_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_location_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_migration_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read geo countries" ON public.geo_countries;
CREATE POLICY "authenticated read geo countries" ON public.geo_countries FOR SELECT TO authenticated USING (enabled=true);
DROP POLICY IF EXISTS "authenticated read geo places" ON public.geo_places;
CREATE POLICY "authenticated read geo places" ON public.geo_places FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant read location settings" ON public.tenant_location_settings;
CREATE POLICY "tenant read location settings" ON public.tenant_location_settings FOR SELECT TO authenticated
USING (tenant_id=public.current_tenant_id() OR public.is_saas_admin(auth.uid()));
DROP POLICY IF EXISTS "tenant admin write location settings" ON public.tenant_location_settings;
CREATE POLICY "tenant admin write location settings" ON public.tenant_location_settings FOR ALL TO authenticated
USING (
  tenant_id=public.current_tenant_id()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (p.tenant_role='tenant_admin' OR p.is_saas_admin=true))
)
WITH CHECK (
  tenant_id=public.current_tenant_id()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (p.tenant_role='tenant_admin' OR p.is_saas_admin=true))
);

DROP POLICY IF EXISTS "tenant read migration map" ON public.location_migration_map;
CREATE POLICY "tenant read migration map" ON public.location_migration_map FOR SELECT TO authenticated
USING (tenant_id=public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant read tracking devices" ON public.tracking_devices;
CREATE POLICY "tenant read tracking devices" ON public.tracking_devices FOR SELECT TO authenticated
USING (tenant_id=public.current_tenant_id() OR public.is_saas_admin(auth.uid()));
DROP POLICY IF EXISTS "tenant read tracking events" ON public.tracking_events;
CREATE POLICY "tenant read tracking events" ON public.tracking_events FOR SELECT TO authenticated
USING (tenant_id=public.current_tenant_id() OR public.is_saas_admin(auth.uid()));

-- PesaPal Uganda: hybrid branch + geography, optimised for fast capture.
INSERT INTO public.tenant_location_settings(
  tenant_id,location_mode,default_country_code,require_branch,require_geography,
  require_internal_location,require_gps,allow_custom_area,allow_inline_location_create,
  remember_last_selection,show_coordinates
)
SELECT id,'hybrid','UG',true,true,false,false,true,true,true,false
FROM public.tenants WHERE slug='default'
ON CONFLICT (tenant_id) DO NOTHING;

-- Sensible default for every other workspace.
INSERT INTO public.tenant_location_settings(tenant_id,location_mode,default_country_code)
SELECT id,'internal','UG' FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
