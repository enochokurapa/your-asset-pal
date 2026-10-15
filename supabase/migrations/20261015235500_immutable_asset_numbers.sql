-- A permanent system asset number is never editable after assignment.
CREATE OR REPLACE FUNCTION public.protect_asset_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.asset_number IS DISTINCT FROM OLD.asset_number THEN
    RAISE EXCEPTION 'System asset number is immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_asset_number_trigger ON public.assets;
CREATE TRIGGER protect_asset_number_trigger BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.protect_asset_number();
