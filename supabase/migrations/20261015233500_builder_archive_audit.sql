-- Retain a tenant-scoped, actor-attributed explanation for every builder archive.
CREATE TABLE IF NOT EXISTS public.builder_archive_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  definition_id uuid NOT NULL,
  builder_key text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS builder_archive_audit_tenant_time ON public.builder_archive_audit (tenant_id, archived_at DESC);
ALTER TABLE public.builder_archive_audit ENABLE ROW LEVEL SECURITY;
-- Only the server-side admin client records these events; clients cannot alter audit history.
REVOKE ALL ON public.builder_archive_audit FROM anon, authenticated;
