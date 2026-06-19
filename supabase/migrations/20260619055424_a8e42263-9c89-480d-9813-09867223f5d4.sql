
-- Remove orphan rows so we can introduce the FK
DELETE FROM public.depreciation_entries WHERE asset_id NOT IN (SELECT id FROM public.assets);
DELETE FROM public.depreciation_overrides WHERE asset_id NOT IN (SELECT id FROM public.assets);

ALTER TABLE public.depreciation_entries
  DROP CONSTRAINT IF EXISTS depreciation_entries_asset_id_fkey;
ALTER TABLE public.depreciation_entries
  ADD CONSTRAINT depreciation_entries_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE public.depreciation_overrides
  DROP CONSTRAINT IF EXISTS depreciation_overrides_asset_id_fkey;
ALTER TABLE public.depreciation_overrides
  ADD CONSTRAINT depreciation_overrides_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.delete_asset_cascade(_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.audit_log     WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.approval_requests WHERE asset_id = _asset_id;
  DELETE FROM public.assets WHERE id = _asset_id;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) TO authenticated;
