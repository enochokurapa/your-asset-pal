-- Branch visibility per user (allow-list; empty = see all)
CREATE TABLE IF NOT EXISTS public.user_branch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_branch_access" ON public.user_branch_access
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_branch_access" ON public.user_branch_access
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Action rights (initiate requests / add assets) granted to non-admin users
CREATE TABLE IF NOT EXISTS public.user_action_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_kind)
);
ALTER TABLE public.user_action_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_action_rights" ON public.user_action_rights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_action_rights" ON public.user_action_rights
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow users with the 'add_asset' action right to insert assets / assignments / imports / movements
CREATE OR REPLACE FUNCTION public.can_do(_user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(_user_id,'admin'::app_role)
      OR has_role(_user_id,'manager'::app_role)
      OR EXISTS (SELECT 1 FROM public.user_action_rights WHERE user_id=_user_id AND action_kind=_action);
$$;

-- Extend asset write policies to include 'add_asset' grantees
DROP POLICY IF EXISTS "mgr insert assets" ON public.assets;
CREATE POLICY "writer insert assets" ON public.assets
  FOR INSERT TO authenticated WITH CHECK (public.can_do(auth.uid(),'add_asset'));

DROP POLICY IF EXISTS "mgr write assignments" ON public.asset_assignments;
CREATE POLICY "writer write assignments" ON public.asset_assignments
  FOR ALL TO authenticated
  USING (public.can_do(auth.uid(),'add_asset'))
  WITH CHECK (public.can_do(auth.uid(),'add_asset'));

DROP POLICY IF EXISTS "mgr write imports" ON public.asset_imports;
CREATE POLICY "writer write imports" ON public.asset_imports
  FOR INSERT TO authenticated WITH CHECK (public.can_do(auth.uid(),'add_asset'));