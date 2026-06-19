
-- 1) condition column on assets
DO $$ BEGIN
  CREATE TYPE public.asset_condition AS ENUM ('mint','good','fair','poor','damaged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS condition public.asset_condition;

-- 2) verifications table
CREATE TABLE IF NOT EXISTS public.asset_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  custodian_name text,
  department text,
  condition public.asset_condition,
  status text NOT NULL CHECK (status IN ('verified','mismatched','not_found')),
  notes text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_verifications_asset ON public.asset_verifications(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_verifications_branch ON public.asset_verifications(branch_id);
CREATE INDEX IF NOT EXISTS idx_asset_verifications_status ON public.asset_verifications(status);
CREATE INDEX IF NOT EXISTS idx_asset_verifications_verified_at ON public.asset_verifications(verified_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_verifications TO authenticated;
GRANT ALL ON public.asset_verifications TO service_role;

ALTER TABLE public.asset_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verif_select_auth" ON public.asset_verifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "verif_insert_rights" ON public.asset_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_action_rights
               WHERE user_id = auth.uid() AND action_kind = 'perform_verification')
  );

CREATE POLICY "verif_update_admin" ON public.asset_verifications
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "verif_delete_admin" ON public.asset_verifications
  FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER touch_asset_verifications
  BEFORE UPDATE ON public.asset_verifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- audit
CREATE TRIGGER audit_asset_verifications
  AFTER INSERT OR UPDATE OR DELETE ON public.asset_verifications
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();
