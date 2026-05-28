
CREATE OR REPLACE FUNCTION public.mark_for_disposal(_asset_id uuid, _on boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assets SET set_for_disposal = _on WHERE id = _asset_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) TO authenticated;
