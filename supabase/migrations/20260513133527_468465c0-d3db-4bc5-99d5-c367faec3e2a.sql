
-- 1. Sub-categories
ALTER TABLE public.categories
  ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- 2. Extend asset_status enum
ALTER TYPE public.asset_status ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE public.asset_status ADD VALUE IF NOT EXISTS 'disposed';

-- 3. Asset assignments / custody
CREATE TABLE public.asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  assigned_to_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name text,
  department text,
  assignment_date date NOT NULL DEFAULT CURRENT_DATE,
  return_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read assignments" ON public.asset_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write assignments" ON public.asset_assignments
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_assignments_asset ON public.asset_assignments(asset_id);

-- 4. Asset movement history
CREATE TABLE public.asset_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  from_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  moved_at date NOT NULL DEFAULT CURRENT_DATE,
  moved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read movements" ON public.asset_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write movements" ON public.asset_movements
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_movements_asset ON public.asset_movements(asset_id);

-- 5. Asset attachments
CREATE TABLE public.asset_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice','receipt','warranty','image','other')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read attachments" ON public.asset_attachments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write attachments" ON public.asset_attachments
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_attachments_asset ON public.asset_attachments(asset_id);

-- 6. Asset disposal records
CREATE TABLE public.asset_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  disposal_reason text NOT NULL,
  disposal_date date NOT NULL DEFAULT CURRENT_DATE,
  disposal_value numeric,
  approval_notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_disposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read disposals" ON public.asset_disposals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write disposals" ON public.asset_disposals
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_disposals_asset ON public.asset_disposals(asset_id);

-- 7. Storage bucket for attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-files','asset-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read asset-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'asset-files');

CREATE POLICY "mgr insert asset-files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'asset-files' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "mgr update asset-files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'asset-files' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "mgr delete asset-files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'asset-files' AND public.is_admin_or_manager(auth.uid()));
