-- Custom values are stored on assets, preserving all original columns and old records.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS register_definition_id uuid REFERENCES public.builder_definitions(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD CONSTRAINT assets_custom_fields_object CHECK (jsonb_typeof(custom_fields)='object');
CREATE OR REPLACE FUNCTION public.validate_asset_register() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.register_definition_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.builder_definitions d WHERE d.id=NEW.register_definition_id
  AND d.tenant_id=NEW.tenant_id AND d.builder_key='register_builder'
 ) THEN RAISE EXCEPTION 'Asset register must belong to this business'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS asset_register_validate ON public.assets;
CREATE TRIGGER asset_register_validate BEFORE INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.validate_asset_register();
