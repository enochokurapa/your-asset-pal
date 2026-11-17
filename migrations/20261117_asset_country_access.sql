-- Safeguard all asset insert/update paths (including imports) against expired country entitlements.
CREATE OR REPLACE FUNCTION public.enforce_asset_country_entitlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc char(2); loc record;
BEGIN
 IF NEW.geo_place_id IS NULL THEN RETURN NEW; END IF;
 SELECT country_code INTO cc FROM public.geo_places WHERE geoname_id=NEW.geo_place_id;
 IF cc IS NULL THEN RAISE EXCEPTION 'Selected geographical place is unavailable'; END IF;
 SELECT default_country_code,allowed_country_codes INTO loc
  FROM public.tenant_location_settings WHERE tenant_id=NEW.tenant_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NOT(cc=ANY(loc.allowed_country_codes)) THEN
  RAISE EXCEPTION 'Geographic country % is not enabled for this organisation',cc;
 END IF;
 IF cc IS DISTINCT FROM loc.default_country_code
   AND NOT EXISTS(SELECT 1 FROM public.tenant_country_entitlements e
      WHERE e.tenant_id=NEW.tenant_id AND e.country_code=cc AND e.ends_at>now())
 THEN RAISE EXCEPTION 'Country % requires a valid paid country subscription',cc;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_asset_country_entitlement ON public.assets;
CREATE TRIGGER trg_enforce_asset_country_entitlement BEFORE INSERT OR UPDATE OF geo_place_id,tenant_id
 ON public.assets FOR EACH ROW EXECUTE FUNCTION public.enforce_asset_country_entitlement();
