
DROP POLICY IF EXISTS "admin delete audit" ON public.audit_log;
DROP POLICY IF EXISTS "admin update audit" ON public.audit_log;

CREATE POLICY "manage audit delete" ON public.audit_log
  FOR DELETE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_action_rights
               WHERE user_id = auth.uid() AND action_kind = 'manage_audit_log')
  );

CREATE POLICY "manage audit update" ON public.audit_log
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_action_rights
               WHERE user_id = auth.uid() AND action_kind = 'manage_audit_log')
  );
