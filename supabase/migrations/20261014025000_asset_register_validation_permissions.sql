-- Ensure asset register membership validation works for authenticated tenant users.
-- The validator checks the tenant match; only its database lookup needs elevated read privilege.
ALTER FUNCTION public.validate_asset_register() SECURITY DEFINER;
ALTER FUNCTION public.validate_asset_register() SET search_path = public;
REVOKE ALL ON FUNCTION public.validate_asset_register() FROM PUBLIC;
