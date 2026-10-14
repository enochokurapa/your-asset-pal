-- Preserve business-generated tags inside the matching field of a custom register.
CREATE OR REPLACE FUNCTION public.assign_custom_asset_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tag_key text; chosen text;
BEGIN
 IF NEW.custom_fields IS NULL OR jsonb_typeof(NEW.custom_fields)<>'object' THEN NEW.custom_fields:='{}'::jsonb; END IF;
 IF NEW.register_definition_id IS NOT NULL THEN
   SELECT field->>'key' INTO tag_key
   FROM public.builder_definitions d
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.configuration->'fields','[]'::jsonb)) field
   WHERE d.id=NEW.register_definition_id AND d.tenant_id=NEW.tenant_id
     AND regexp_replace(lower(COALESCE(field->>'label',field->>'key')),'[^a-z0-9]','','g')
         IN ('assettag','tagnumber','tag','tagno')
   LIMIT 1;
 END IF;
 IF tag_key IS NOT NULL THEN
   chosen:=nullif(btrim(NEW.custom_fields->>tag_key),'');
   IF chosen IS NOT NULL THEN NEW.asset_tag:=chosen; END IF;
 END IF;
 IF NEW.asset_tag IS NULL OR NEW.asset_tag='' OR NEW.asset_tag LIKE 'AUTO-%' THEN
   NEW.asset_tag:=public.generate_asset_tag_for_tenant(NEW.tenant_id);
 END IF;
 IF tag_key IS NOT NULL THEN
   NEW.custom_fields:=jsonb_set(NEW.custom_fields,ARRAY[tag_key],to_jsonb(NEW.asset_tag),true);
 END IF;
 RETURN NEW;
END $$;
