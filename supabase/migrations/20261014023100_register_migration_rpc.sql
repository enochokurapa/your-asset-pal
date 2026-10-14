
CREATE OR REPLACE FUNCTION public.run_asset_register_migration(
 p_tenant uuid,p_source uuid,p_target uuid,p_mapping jsonb,p_policy text,p_actor uuid)
RETURNS TABLE(migration_id uuid,affected_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m uuid; n integer; rec record; vals jsonb; k text; v text; dest text; selected_values jsonb; target_keys text[];
BEGIN
 IF p_policy NOT IN ('preserve','skip') OR jsonb_typeof(p_mapping)<>'object' THEN RAISE EXCEPTION 'Invalid migration settings'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.builder_definitions WHERE id=p_target AND tenant_id=p_tenant AND builder_key='register_builder' AND is_active) THEN RAISE EXCEPTION 'Target register does not belong to this business'; END IF;
 IF p_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.builder_definitions WHERE id=p_source AND tenant_id=p_tenant AND builder_key='register_builder') THEN RAISE EXCEPTION 'Invalid source register'; END IF;
 SELECT ARRAY(SELECT f->>'key' FROM public.builder_definitions d CROSS JOIN LATERAL jsonb_array_elements(d.configuration->'fields') f WHERE d.id=p_target) INTO target_keys;
 IF EXISTS (SELECT 1 FROM jsonb_each_text(p_mapping) x WHERE NOT (x.key = ANY(target_keys))) THEN RAISE EXCEPTION 'Mapping contains unknown target fields'; END IF;
 INSERT INTO public.asset_register_migrations(tenant_id,source_register_id,target_register_id,field_mapping,unmapped_policy,created_by)
 VALUES(p_tenant,p_source,p_target,p_mapping,p_policy,p_actor) RETURNING id INTO m;
 n:=0;
 FOR rec IN SELECT a.* FROM public.assets a WHERE a.tenant_id=p_tenant AND a.register_definition_id IS NOT DISTINCT FROM p_source FOR UPDATE LOOP
   vals:=COALESCE(rec.custom_fields,'{}'::jsonb);selected_values:='{}'::jsonb;
   FOR dest,v IN SELECT x.key,x.value FROM jsonb_each_text(p_mapping) x LOOP
     IF v LIKE 'core:%' THEN
       CASE substring(v from 6)
        WHEN 'asset_tag' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.asset_tag),true);
        WHEN 'name' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.name),true);
        WHEN 'serial_number' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.serial_number),true);
        WHEN 'description' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.description),true);
        WHEN 'purchase_date' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.purchase_date),true);
        WHEN 'purchase_value' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.purchase_value),true);
        WHEN 'status' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],to_jsonb(rec.status::text),true);
        ELSE RAISE EXCEPTION 'Invalid core source field %',v;
       END CASE;
     ELSIF v LIKE 'custom:%' THEN selected_values:=jsonb_set(selected_values,ARRAY[dest],COALESCE(vals->substring(v from 8),'null'::jsonb),true);
     ELSE RAISE EXCEPTION 'Invalid mapping source %',v; END IF;
   END LOOP;
   INSERT INTO public.asset_register_migration_snapshots(migration_id,asset_id,previous_register_id,previous_custom_fields) VALUES(m,rec.id,rec.register_definition_id,vals);
   UPDATE public.assets SET register_definition_id=p_target,custom_fields=CASE WHEN p_policy='preserve' THEN vals||selected_values ELSE selected_values END WHERE id=rec.id;
   n:=n+1;
 END LOOP;
 UPDATE public.asset_register_migrations SET affected_count=n WHERE id=m;
 RETURN QUERY SELECT m,n;
END $$;
CREATE OR REPLACE FUNCTION public.undo_asset_register_migration(p_tenant uuid,p_migration uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; target uuid;
BEGIN
 SELECT target_register_id INTO target FROM public.asset_register_migrations WHERE id=p_migration AND tenant_id=p_tenant AND status='completed' FOR UPDATE;
 IF target IS NULL THEN RAISE EXCEPTION 'Migration not found or already reversed'; END IF;
 IF EXISTS(SELECT 1 FROM public.asset_register_migration_snapshots s JOIN public.assets a ON a.id=s.asset_id WHERE s.migration_id=p_migration AND a.register_definition_id IS DISTINCT FROM target) THEN RAISE EXCEPTION 'Some assets have been moved since this migration; undo blocked'; END IF;
 UPDATE public.assets a SET register_definition_id=s.previous_register_id,custom_fields=s.previous_custom_fields FROM public.asset_register_migration_snapshots s WHERE s.migration_id=p_migration AND a.id=s.asset_id AND a.tenant_id=p_tenant;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.asset_register_migrations SET status='reversed' WHERE id=p_migration;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.run_asset_register_migration(uuid,uuid,uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.undo_asset_register_migration(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_asset_register_migration(uuid,uuid,uuid,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_asset_register_migration(uuid,uuid) TO service_role;
