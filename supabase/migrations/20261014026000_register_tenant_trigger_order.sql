-- PostgreSQL runs triggers of the same timing/event in name order.
-- Assign the tenant before validating the chosen register.
DROP TRIGGER IF EXISTS asset_register_validate ON public.assets;
DROP TRIGGER IF EXISTS z_validate_asset_register ON public.assets;
CREATE TRIGGER z_validate_asset_register
BEFORE INSERT OR UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.validate_asset_register();
