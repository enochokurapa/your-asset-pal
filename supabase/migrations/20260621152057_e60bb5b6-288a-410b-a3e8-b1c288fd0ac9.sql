REVOKE EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) TO authenticated;