UPDATE public.document_templates dt
SET organization_name = t.name,
    updated_at = now()
FROM public.tenants t
WHERE dt.tenant_id = t.id
  AND dt.is_active = true
  AND (
    dt.organization_name IS NULL
    OR btrim(dt.organization_name) = ''
    OR lower(btrim(dt.organization_name)) IN ('your organization','your organisation')
  );

NOTIFY pgrst, 'reload schema';
