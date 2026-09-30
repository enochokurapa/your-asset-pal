-- Harden AssetFlow for public multi-tenant SaaS usage.
-- Every customer-owned row is stamped with tenant_id, existing authorization
-- policies are intersected with a restrictive tenant boundary, and file access
-- is scoped to a tenant-specific storage prefix.

BEGIN;

DO $$
DECLARE
  table_name text;
  default_tenant uuid;
BEGIN
  SELECT id INTO default_tenant FROM public.tenants WHERE slug = 'default' LIMIT 1;
  IF default_tenant IS NULL THEN
    RAISE EXCEPTION 'Default tenant is missing; apply saas_policy.sql first';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'categories','locations','assets','branches',
    'asset_assignments','asset_movements','asset_attachments','asset_disposals',
    'audit_log','notifications','approval_requests','asset_imports',
    'user_notification_prefs','category_depreciation_defaults',
    'depreciation_runs','depreciation_entries','depreciation_overrides',
    'gate_passes','document_templates','asset_verifications','depreciation_run_logs'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE',
        table_name
      );
      EXECUTE format(
        'UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL',
        table_name
      ) USING default_tenant;
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL',
        table_name
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
        'idx_' || table_name || '_tenant',
        table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_row_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_tenant uuid;
BEGIN
  actor_tenant := public.current_tenant_id();

  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := actor_tenant;
    END IF;
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_id is required';
    END IF;
    IF actor_tenant IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM actor_tenant THEN
      RAISE EXCEPTION 'Cross-tenant insert blocked';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'tenant_id cannot be changed';
    END IF;
    IF actor_tenant IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM actor_tenant THEN
      RAISE EXCEPTION 'Cross-tenant update blocked';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_row_tenant() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'categories','locations','assets','branches',
    'asset_assignments','asset_movements','asset_attachments','asset_disposals',
    'audit_log','notifications','approval_requests','asset_imports',
    'user_notification_prefs','category_depreciation_defaults',
    'depreciation_runs','depreciation_entries','depreciation_overrides',
    'gate_passes','document_templates','asset_verifications','depreciation_run_logs'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS enforce_row_tenant ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER enforce_row_tenant BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_row_tenant()',
        table_name
      );

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || ' tenant boundary', table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id())',
        table_name || ' tenant boundary',
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- Prevent references from one workspace to rows owned by another workspace.
CREATE OR REPLACE FUNCTION public.enforce_same_tenant_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reference_id uuid;
  reference_tenant uuid;
  reference_table text := TG_ARGV[0];
  reference_column text := TG_ARGV[1];
BEGIN
  reference_id := NULLIF(to_jsonb(NEW)->>reference_column, '')::uuid;
  IF reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT tenant_id FROM public.%I WHERE id = $1', reference_table)
    INTO reference_tenant
    USING reference_id;

  IF reference_tenant IS NULL OR reference_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant reference blocked for %.%', TG_TABLE_NAME, reference_column;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_same_tenant_reference() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  spec text[];
  trigger_name text;
  source_table text;
  source_column text;
  target_table text;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['assets','category_id','categories'],
    ARRAY['assets','location_id','locations'],
    ARRAY['assets','branch_id','branches'],
    ARRAY['assets','assigned_to','profiles'],
    ARRAY['asset_assignments','asset_id','assets'],
    ARRAY['asset_assignments','assigned_to_user','profiles'],
    ARRAY['asset_movements','asset_id','assets'],
    ARRAY['asset_movements','from_location_id','locations'],
    ARRAY['asset_movements','to_location_id','locations'],
    ARRAY['asset_movements','from_branch_id','branches'],
    ARRAY['asset_movements','to_branch_id','branches'],
    ARRAY['asset_attachments','asset_id','assets'],
    ARRAY['asset_disposals','asset_id','assets'],
    ARRAY['approval_requests','asset_id','assets'],
    ARRAY['category_depreciation_defaults','category_id','categories'],
    ARRAY['depreciation_entries','run_id','depreciation_runs'],
    ARRAY['depreciation_entries','asset_id','assets'],
    ARRAY['depreciation_overrides','asset_id','assets'],
    ARRAY['gate_passes','asset_id','assets'],
    ARRAY['gate_passes','branch_id','branches'],
    ARRAY['asset_verifications','asset_id','assets'],
    ARRAY['asset_verifications','branch_id','branches'],
    ARRAY['asset_verifications','location_id','locations'],
    ARRAY['depreciation_run_logs','run_id','depreciation_runs'],
    ARRAY['depreciation_run_logs','asset_id','assets']
  ]
  LOOP
    source_table := spec[1];
    source_column := spec[2];
    target_table := spec[3];

    IF to_regclass('public.' || source_table) IS NOT NULL
       AND to_regclass('public.' || target_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = source_table
           AND column_name = source_column
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = target_table
           AND column_name = 'tenant_id'
       )
    THEN
      trigger_name := 'tenant_ref_' || source_table || '_' || source_column;
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, source_table);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_same_tenant_reference(%L,%L)',
        trigger_name, source_column, source_table, target_table, source_column
      );
    END IF;
  END LOOP;
END $$;

-- Identifiers that only need to be unique inside one organization.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_name_key;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_asset_tag_key;

CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_name_key
  ON public.categories (tenant_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS locations_tenant_name_key
  ON public.locations (tenant_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS assets_tenant_asset_tag_key
  ON public.assets (tenant_id, asset_tag);

DO $$
BEGIN
  IF to_regclass('public.gate_passes') IS NOT NULL THEN
    ALTER TABLE public.gate_passes DROP CONSTRAINT IF EXISTS gate_passes_pass_number_key;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS gate_passes_tenant_pass_number_key
      ON public.gate_passes (tenant_id, pass_number) WHERE pass_number IS NOT NULL';
  END IF;

  IF to_regclass('public.category_depreciation_defaults') IS NOT NULL THEN
    ALTER TABLE public.category_depreciation_defaults
      DROP CONSTRAINT IF EXISTS category_depreciation_defaults_category_id_key;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS category_depreciation_defaults_tenant_category_key
      ON public.category_depreciation_defaults (tenant_id, category_id)';
  END IF;

  IF to_regclass('public.depreciation_runs') IS NOT NULL THEN
    ALTER TABLE public.depreciation_runs
      DROP CONSTRAINT IF EXISTS depreciation_runs_period_start_period_end_key;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS depreciation_runs_tenant_period_key
      ON public.depreciation_runs (tenant_id, period_start, period_end)';
  END IF;
END $$;

-- Isolate private storage. New objects must live under <tenant-uuid>/...
-- Legacy unprefixed objects are visible only to the original default workspace.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "auth read asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "mgr insert asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "mgr update asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "mgr delete asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "tenant read asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "tenant insert asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "tenant update asset-files" ON storage.objects;
    DROP POLICY IF EXISTS "tenant delete asset-files" ON storage.objects;

    CREATE POLICY "tenant read asset-files" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'asset-files'
        AND (
          split_part(name, '/', 1) = public.current_tenant_id()::text
          OR (
            public.current_tenant_id() = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
            AND name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
          )
        )
      );

    CREATE POLICY "tenant insert asset-files" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'asset-files'
        AND split_part(name, '/', 1) = public.current_tenant_id()::text
        AND public.is_admin_or_manager(auth.uid())
      );

    CREATE POLICY "tenant update asset-files" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'asset-files'
        AND split_part(name, '/', 1) = public.current_tenant_id()::text
        AND public.is_admin_or_manager(auth.uid())
      )
      WITH CHECK (
        bucket_id = 'asset-files'
        AND split_part(name, '/', 1) = public.current_tenant_id()::text
        AND public.is_admin_or_manager(auth.uid())
      );

    CREATE POLICY "tenant delete asset-files" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'asset-files'
        AND public.is_admin_or_manager(auth.uid())
        AND (
          split_part(name, '/', 1) = public.current_tenant_id()::text
          OR (
            public.current_tenant_id() = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
            AND name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
          )
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
