-- Tenant-admin management policies for the gated live-tracking module.
DROP POLICY IF EXISTS "tenant admin manage tracking devices" ON public.tracking_devices;
CREATE POLICY "tenant admin manage tracking devices" ON public.tracking_devices
FOR ALL TO authenticated
USING (
  tenant_id=public.current_tenant_id()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.tenant_role='tenant_admin')
)
WITH CHECK (
  tenant_id=public.current_tenant_id()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.tenant_role='tenant_admin')
);

NOTIFY pgrst, 'reload schema';
