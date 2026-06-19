
CREATE OR REPLACE FUNCTION public.delete_asset_cascade(_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_action_rights
       WHERE user_id = auth.uid() AND action_kind = 'approve_asset_deletion'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to delete assets';
  END IF;

  DELETE FROM public.notifications WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.audit_log     WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.approval_requests WHERE asset_id = _asset_id;
  DELETE FROM public.assets WHERE id = _asset_id;
END $$;
