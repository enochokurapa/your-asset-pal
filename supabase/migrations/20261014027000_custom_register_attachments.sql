-- Asset attachment uploads follow the same tenant and add-asset permission as asset registration.
DROP POLICY IF EXISTS "tenant insert asset-files" ON storage.objects;
CREATE POLICY "tenant insert asset-files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='asset-files'
 AND split_part(name,'/',1)=public.current_tenant_id()::text
 AND (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'add_asset'))
);
