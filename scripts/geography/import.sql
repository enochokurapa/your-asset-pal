\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE new_countries(code text,name text,geoname_id bigint) ON COMMIT DROP;
CREATE TEMP TABLE new_regions(geoname_id bigint,country_code text,parent_geoname_id bigint,name text,ascii_name text,admin1_code text,display_path text) ON COMMIT DROP;
CREATE TEMP TABLE new_districts(geoname_id bigint,country_code text,parent_geoname_id bigint,name text,ascii_name text,admin1_code text,admin2_code text,display_path text) ON COMMIT DROP;
\copy new_countries FROM '/tmp/assetflow-world-countries.tsv' WITH (FORMAT csv, DELIMITER E'\t', NULL '\N')
\copy new_regions FROM '/tmp/assetflow-world-regions.tsv' WITH (FORMAT csv, DELIMITER E'\t', NULL '\N')
\copy new_districts FROM '/tmp/assetflow-world-districts.tsv' WITH (FORMAT csv, DELIMITER E'\t', NULL '\N')
INSERT INTO public.geo_countries(code,name,geoname_id,enabled,source)
SELECT code,name,geoname_id,true,'geonames-global' FROM new_countries
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,updated_at=now()
WHERE public.geo_countries.source='geonames-global' AND public.geo_countries.name IS DISTINCT FROM EXCLUDED.name;
INSERT INTO public.geo_places(geoname_id,country_code,parent_geoname_id,name,ascii_name,feature_class,feature_code,admin_level,admin1_code,display_path,source)
SELECT r.geoname_id,r.country_code,r.parent_geoname_id,r.name,r.ascii_name,'A','ADM1',1,r.admin1_code,r.display_path,'geonames-global'
FROM new_regions r JOIN public.geo_countries c ON c.code=r.country_code
ON CONFLICT(geoname_id) DO UPDATE SET
name=EXCLUDED.name,ascii_name=EXCLUDED.ascii_name,display_path=EXCLUDED.display_path,updated_at=now()
WHERE public.geo_places.source='geonames-global' AND (public.geo_places.name IS DISTINCT FROM EXCLUDED.name OR public.geo_places.ascii_name IS DISTINCT FROM EXCLUDED.ascii_name OR public.geo_places.display_path IS DISTINCT FROM EXCLUDED.display_path);
INSERT INTO public.geo_places(geoname_id,country_code,parent_geoname_id,name,ascii_name,feature_class,feature_code,admin_level,admin1_code,admin2_code,display_path,source)
SELECT d.geoname_id,d.country_code,d.parent_geoname_id,d.name,d.ascii_name,'A','ADM2',2,d.admin1_code,d.admin2_code,d.display_path,'geonames-global'
FROM new_districts d JOIN public.geo_countries c ON c.code=d.country_code
ON CONFLICT(geoname_id) DO UPDATE SET
name=EXCLUDED.name,ascii_name=EXCLUDED.ascii_name,display_path=EXCLUDED.display_path,updated_at=now()
WHERE public.geo_places.source='geonames-global' AND (public.geo_places.name IS DISTINCT FROM EXCLUDED.name OR public.geo_places.ascii_name IS DISTINCT FROM EXCLUDED.ascii_name OR public.geo_places.display_path IS DISTINCT FROM EXCLUDED.display_path);
COMMIT;
SELECT 'COUNTRIES',count(*) FROM public.geo_countries;
SELECT 'PLACES',count(*) FROM public.geo_places;
SELECT 'COVERED_COUNTRIES',count(DISTINCT country_code) FROM public.geo_places WHERE feature_code='ADM2';
