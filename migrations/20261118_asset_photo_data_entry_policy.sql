-- Let authorised data entrants attach photographic evidence without granting
-- unrelated invoice/warranty editing or permanent deletion privileges.
DROP POLICY IF EXISTS "authorized staff upload asset photo" ON public.asset_attachments;
CREATE POLICY "authorized staff upload asset photo"
ON public.asset_attachments FOR INSERT TO authenticated
WITH CHECK (
 kind='image'
 AND tenant_id=public.current_tenant_id()
 AND EXISTS(
  SELECT 1 FROM public.assets a
  WHERE a.id=asset_id AND a.tenant_id=public.current_tenant_id()
 )
 AND (
  public.can_do(auth.uid(),'add_asset')
  OR public.can_do(auth.uid(),'edit_asset')
  OR public.can_do(auth.uid(),'perform_verification')
 )
);
