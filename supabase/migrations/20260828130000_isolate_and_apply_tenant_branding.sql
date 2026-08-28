-- Give every customer its own branding row and prevent cross-tenant reads/writes.
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Preserve an existing customized row by assigning it to the tenant of its editor.
UPDATE public.document_templates d
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE d.tenant_id IS NULL
  AND d.updated_by = p.id
  AND p.tenant_id IS NOT NULL;

-- Legacy single-tenant installs had one global row. Keep it for the first tenant.
UPDATE public.document_templates d
SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at NULLS LAST, id LIMIT 1)
WHERE d.tenant_id IS NULL
  AND d.id = (SELECT id FROM public.document_templates WHERE tenant_id IS NULL ORDER BY updated_at DESC LIMIT 1);

-- Remove other orphaned global defaults and create a clean row for every tenant missing one.
DELETE FROM public.document_templates WHERE tenant_id IS NULL;
INSERT INTO public.document_templates (tenant_id, name, is_active, organization_name)
SELECT t.id, 'Default', true, t.name
FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.document_templates d WHERE d.tenant_id = t.id);

ALTER TABLE public.document_templates ALTER COLUMN tenant_id SET NOT NULL;

-- If legacy data contains several active rows, keep the newest one active.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY updated_at DESC, id) AS position
  FROM public.document_templates
  WHERE is_active
)
UPDATE public.document_templates d
SET is_active = false
FROM ranked r
WHERE d.id = r.id AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS document_templates_one_active_per_tenant
  ON public.document_templates (tenant_id) WHERE is_active;

DROP POLICY IF EXISTS "Any authenticated user can read templates" ON public.document_templates;
DROP POLICY IF EXISTS "Authorized users can insert templates" ON public.document_templates;
DROP POLICY IF EXISTS "Authorized users can update templates" ON public.document_templates;
DROP POLICY IF EXISTS "Authorized users can delete templates" ON public.document_templates;

CREATE POLICY "Tenant members can read their branding"
  ON public.document_templates FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Authorized tenant users can insert branding"
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND public.can_do(auth.uid(), 'manage_document_templates')
  );

CREATE POLICY "Authorized tenant users can update branding"
  ON public.document_templates FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND public.can_do(auth.uid(), 'manage_document_templates')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND public.can_do(auth.uid(), 'manage_document_templates')
  );

CREATE POLICY "Authorized tenant users can delete branding"
  ON public.document_templates FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND public.can_do(auth.uid(), 'manage_document_templates')
  );

NOTIFY pgrst, 'reload schema';
