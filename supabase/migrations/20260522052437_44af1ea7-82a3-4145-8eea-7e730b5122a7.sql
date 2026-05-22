
-- Allow editors with specific action rights to update assets / locations
DROP POLICY IF EXISTS "mgr update assets" ON public.assets;
CREATE POLICY "editor update assets" ON public.assets
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(), 'edit_asset'));

DROP POLICY IF EXISTS "mgr update locations" ON public.locations;
CREATE POLICY "editor update locations" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(), 'edit_location'));
