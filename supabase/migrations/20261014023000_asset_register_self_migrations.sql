CREATE TABLE IF NOT EXISTS public.asset_register_migrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 source_register_id uuid REFERENCES public.builder_definitions(id) ON DELETE SET NULL,
 target_register_id uuid NOT NULL REFERENCES public.builder_definitions(id),
 field_mapping jsonb NOT NULL,
 unmapped_policy text NOT NULL CHECK(unmapped_policy IN ('preserve','skip')),
 status text NOT NULL DEFAULT 'completed',
 affected_count integer NOT NULL DEFAULT 0,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.asset_register_migration_snapshots (
 migration_id uuid NOT NULL REFERENCES public.asset_register_migrations(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
 previous_register_id uuid,
 previous_custom_fields jsonb NOT NULL,
 PRIMARY KEY(migration_id,asset_id)
);
ALTER TABLE public.asset_register_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_register_migration_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_register_migrations,public.asset_register_migration_snapshots FROM anon,authenticated;
GRANT ALL ON public.asset_register_migrations,public.asset_register_migration_snapshots TO service_role;
