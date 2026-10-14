CREATE TABLE IF NOT EXISTS public.tenant_asset_tag_settings (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 prefix text NOT NULL DEFAULT 'AST' CHECK (prefix ~ '^[A-Z0-9]{1,10}$'),
 separator text NOT NULL DEFAULT '-' CHECK(separator IN ('','-','/')),
 padding integer NOT NULL DEFAULT 5 CHECK(padding BETWEEN 2 AND 12),
 next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_asset_tag_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_asset_tag_settings FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.tenant_asset_tag_settings TO service_role;
CREATE OR REPLACE FUNCTION public.generate_asset_tag_for_tenant(p_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.tenant_asset_tag_settings%ROWTYPE; v_tag text;
BEGIN
 IF p_tenant IS NULL THEN RAISE EXCEPTION 'Missing tenant for tag allocation'; END IF;
 INSERT INTO public.tenant_asset_tag_settings(tenant_id) VALUES(p_tenant) ON CONFLICT DO NOTHING;
 SELECT * INTO v_row FROM public.tenant_asset_tag_settings WHERE tenant_id=p_tenant FOR UPDATE;
 LOOP
   v_tag:=v_row.prefix||v_row.separator||lpad(v_row.next_number::text,v_row.padding,'0');
   UPDATE public.tenant_asset_tag_settings SET next_number=next_number+1,updated_at=now() WHERE tenant_id=p_tenant;
   EXIT WHEN NOT EXISTS (SELECT 1 FROM public.assets WHERE tenant_id=p_tenant AND asset_tag=v_tag);
   v_row.next_number:=v_row.next_number+1;
 END LOOP;
 RETURN v_tag;
END $$;
REVOKE ALL ON FUNCTION public.generate_asset_tag_for_tenant(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_asset_tag_for_tenant(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.assign_custom_asset_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.asset_tag IS NULL OR NEW.asset_tag='' OR NEW.asset_tag LIKE 'AUTO-%' THEN
   NEW.asset_tag:=public.generate_asset_tag_for_tenant(NEW.tenant_id);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assign_custom_asset_tag_trigger ON public.assets;
DROP TRIGGER IF EXISTS zz_assign_custom_asset_tag_trigger ON public.assets;
CREATE TRIGGER zz_assign_custom_asset_tag_trigger BEFORE INSERT ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.assign_custom_asset_tag();
