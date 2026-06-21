DROP POLICY IF EXISTS "mgr update approvals" ON public.approval_requests;

CREATE POLICY "eligible approvers can decide approvals"
ON public.approval_requests
FOR UPDATE
TO authenticated
USING (
  status = 'pending'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_approval_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.approval_kind = approval_requests.kind
    )
  )
  AND (
    requested_by IS DISTINCT FROM auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_action_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.action_kind = 'approve_own_request'
    )
  )
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_approval_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.approval_kind = approval_requests.kind
    )
  )
  AND (
    requested_by IS DISTINCT FROM auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_action_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.action_kind = 'approve_own_request'
    )
  )
);