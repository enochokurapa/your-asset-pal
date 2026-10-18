CREATE TABLE IF NOT EXISTS public.tenant_role_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 70),
 description text NOT NULL DEFAULT '',
 base_role text NOT NULL DEFAULT 'staff' CHECK(base_role IN ('admin','manager','staff','security')),
 modules text[] NOT NULL DEFAULT ARRAY[]::text[],
 actions text[] NOT NULL DEFAULT ARRAY[]::text[],
 approvals text[] NOT NULL DEFAULT ARRAY[]::text[],
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,name)
);
CREATE TABLE IF NOT EXISTS public.tenant_role_assignments (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 template_id uuid NOT NULL REFERENCES public.tenant_role_templates(id) ON DELETE CASCADE,
 PRIMARY KEY (tenant_id,user_id)
);
ALTER TABLE public.tenant_role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_role_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_role_templates,public.tenant_role_assignments FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.manage_tenant_role_template(p_operation text,p_id uuid,p_name text,p_description text,p_base_role text,p_modules text[],p_actions text[],p_approvals text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; role_id uuid;
BEGIN
 SELECT tenant_id INTO t FROM public.profiles WHERE id=auth.uid() AND tenant_role='tenant_admin' AND is_active=true AND is_saas_admin=false;
 IF t IS NULL THEN RAISE EXCEPTION 'Business administrator required' USING ERRCODE='42501'; END IF;
 IF p_operation='delete' THEN
  DELETE FROM public.tenant_role_templates WHERE tenant_id=t AND id=p_id;
  RETURN p_id;
 END IF;
 IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 2 AND 70 OR p_base_role NOT IN ('admin','manager','staff','security') THEN
 RAISE EXCEPTION 'Invalid role name or base role'; END IF;
 IF p_operation='create' THEN
 INSERT INTO public.tenant_role_templates(tenant_id,name,description,base_role,modules,actions,approvals)
 VALUES(t,trim(p_name),coalesce(p_description,''),p_base_role,coalesce(p_modules,ARRAY[]::text[]),coalesce(p_actions,ARRAY[]::text[]),coalesce(p_approvals,ARRAY[]::text[])) RETURNING id INTO role_id;
 ELSIF p_operation='update' THEN
 UPDATE public.tenant_role_templates SET name=trim(p_name),description=coalesce(p_description,''),base_role=p_base_role,modules=coalesce(p_modules,ARRAY[]::text[]),actions=coalesce(p_actions,ARRAY[]::text[]),approvals=coalesce(p_approvals,ARRAY[]::text[]),updated_at=now()
 WHERE id=p_id AND tenant_id=t RETURNING id INTO role_id;
 ELSE RAISE EXCEPTION 'Unknown operation'; END IF;
 IF role_id IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
 RETURN role_id;
END;$$;
CREATE OR REPLACE FUNCTION public.my_tenant_role_templates()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.name),'[]'::jsonb)
 FROM public.tenant_role_templates r JOIN public.profiles p ON p.tenant_id=r.tenant_id
 WHERE p.id=auth.uid() AND p.is_active=true
$$;
CREATE OR REPLACE FUNCTION public.set_tenant_role_assignment(p_user uuid,p_template uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid;
BEGIN
 SELECT tenant_id INTO t FROM public.profiles WHERE id=auth.uid() AND tenant_role='tenant_admin' AND is_active=true AND is_saas_admin=false;
 IF t IS NULL THEN RAISE EXCEPTION 'Business administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND tenant_id=t AND is_saas_admin=false) THEN RAISE EXCEPTION 'User not in business'; END IF;
 IF p_user=auth.uid() THEN RAISE EXCEPTION 'Cannot alter own role template'; END IF;
 IF p_template IS NULL THEN DELETE FROM public.tenant_role_assignments WHERE tenant_id=t AND user_id=p_user; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_role_templates WHERE tenant_id=t AND id=p_template) THEN RAISE EXCEPTION 'Role template not in business'; END IF;
 INSERT INTO public.tenant_role_assignments(tenant_id,user_id,template_id) VALUES(t,p_user,p_template)
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET template_id=excluded.template_id;
END;$$;
CREATE OR REPLACE FUNCTION public.my_tenant_role_assignments()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)
 FROM public.tenant_role_assignments a JOIN public.profiles p ON p.tenant_id=a.tenant_id
 WHERE p.id=auth.uid() AND p.tenant_role='tenant_admin' AND p.is_active=true
$$;
GRANT EXECUTE ON FUNCTION public.manage_tenant_role_template(text,uuid,text,text,text,text[],text[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_tenant_role_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_role_assignment(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_tenant_role_assignments() TO authenticated;
