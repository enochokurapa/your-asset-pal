
-- Document templates: one organization-wide settings row controls all generated PDFs.
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default',
  is_active boolean NOT NULL DEFAULT true,
  -- branding
  logo_data_url text,
  logo_position text NOT NULL DEFAULT 'left' CHECK (logo_position IN ('left','center','right','none')),
  logo_max_height numeric NOT NULL DEFAULT 14,
  organization_name text NOT NULL DEFAULT 'Your Organization',
  -- header/footer
  header_text text NOT NULL DEFAULT '',
  header_show boolean NOT NULL DEFAULT true,
  footer_text text NOT NULL DEFAULT '',
  footer_show boolean NOT NULL DEFAULT true,
  show_page_numbers boolean NOT NULL DEFAULT true,
  show_generated_at boolean NOT NULL DEFAULT true,
  -- watermark
  watermark_text text NOT NULL DEFAULT '',
  watermark_image_data_url text,
  watermark_opacity numeric NOT NULL DEFAULT 0.10 CHECK (watermark_opacity >= 0 AND watermark_opacity <= 1),
  watermark_position text NOT NULL DEFAULT 'diagonal' CHECK (watermark_position IN ('center','diagonal','repeated','none')),
  -- layout
  font_family text NOT NULL DEFAULT 'helvetica' CHECK (font_family IN ('helvetica','times','courier')),
  base_font_size numeric NOT NULL DEFAULT 10 CHECK (base_font_size BETWEEN 6 AND 24),
  margin_top numeric NOT NULL DEFAULT 20,
  margin_right numeric NOT NULL DEFAULT 14,
  margin_bottom numeric NOT NULL DEFAULT 20,
  margin_left numeric NOT NULL DEFAULT 14,
  orientation text NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
  paper_size text NOT NULL DEFAULT 'a4' CHECK (paper_size IN ('a4','letter','legal')),
  -- theme
  primary_color text NOT NULL DEFAULT '#1e293b',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any authenticated user can read templates"
  ON public.document_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can insert templates"
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (public.can_do(auth.uid(), 'manage_document_templates'));

CREATE POLICY "Authorized users can update templates"
  ON public.document_templates FOR UPDATE TO authenticated
  USING (public.can_do(auth.uid(), 'manage_document_templates'))
  WITH CHECK (public.can_do(auth.uid(), 'manage_document_templates'));

CREATE POLICY "Authorized users can delete templates"
  ON public.document_templates FOR DELETE TO authenticated
  USING (public.can_do(auth.uid(), 'manage_document_templates'));

CREATE TRIGGER trg_document_templates_touch
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed a default row
INSERT INTO public.document_templates (name, is_active)
VALUES ('Default', true);
