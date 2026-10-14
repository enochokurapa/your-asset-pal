-- Keep the default register as an implicit null selection. Retain every custom register.
CREATE TABLE IF NOT EXISTS public.tenant_primary_registers (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 definition_id uuid REFERENCES public.builder_definitions(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_primary_registers_definition_idx ON public.tenant_primary_registers(definition_id);
ALTER TABLE public.tenant_primary_registers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_primary_registers FROM anon,authenticated;
-- A selected register is always tenant-owned and must be a register builder definition.
CREATE OR REPLACE FUNCTION public.validate_primary_register() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.definition_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.builder_definitions b WHERE b.id=NEW.definition_id
   AND b.tenant_id=NEW.tenant_id AND b.builder_key='register_builder' AND b.is_active
 ) THEN RAISE EXCEPTION 'Primary register must be an active register belonging to the tenant'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS primary_register_validate ON public.tenant_primary_registers;
CREATE TRIGGER primary_register_validate BEFORE INSERT OR UPDATE ON public.tenant_primary_registers
FOR EACH ROW EXECUTE FUNCTION public.validate_primary_register();
