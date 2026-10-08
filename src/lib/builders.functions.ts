import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const db = supabaseAdmin as any;
const kinds = ["register_builder","report_builder","form_builder","dashboard_builder","document_builder"] as const;
const kindSchema = z.enum(kinds);
const configSchema = z.record(z.string(), z.unknown());
const idSchema = z.string().uuid();

async function authorize(userId: string, kind: typeof kinds[number]) {
  const {data: profile,error} = await db.from("profiles")
    .select("tenant_id,tenant_role,is_saas_admin,is_active").eq("id",userId).single();
  if(error || !profile || profile.is_saas_admin || !profile.is_active || !profile.tenant_id)
    throw new Error("An active business account is required.");
  const {data:role,error:roleError} = await db.from("user_roles")
    .select("role").eq("user_id",userId).eq("role","admin").maybeSingle();
  if(roleError) throw new Error(roleError.message);
  if(profile.tenant_role !== "tenant_admin" && !role)
    throw new Error("Only a business administrator may configure builders.");
  const {data:tenant,error:tenantError} = await db.from("tenants")
    .select("subscription_status,trial_ends_at,subscription_ends_at").eq("id",profile.tenant_id).single();
  if(tenantError || !tenant) throw new Error("Business not found.");
  const now = Date.now();
  const paid = tenant.subscription_status === "active" &&
    (!tenant.subscription_ends_at || Date.parse(tenant.subscription_ends_at) > now);
  const trial = tenant.subscription_status === "trial" &&
    (!tenant.trial_ends_at || Date.parse(tenant.trial_ends_at) > now);
  if(!paid && !trial) throw new Error("Your business subscription is not active.");
  const {data:module,error:moduleError} = await db.from("saas_modules")
    .select("globally_enabled,billing_model,paid_enabled,trial_enabled").eq("module_key",kind).single();
  if(moduleError || !module || !module.globally_enabled)
    throw new Error("This builder is disabled by the platform administrator.");
  const {data:override,error:overrideError} = await db.from("tenant_module_overrides")
    .select("enabled").eq("tenant_id",profile.tenant_id).eq("module_key",kind).maybeSingle();
  if(overrideError) throw new Error(overrideError.message);
  const allowed = module.billing_model === "add_on"
    ? override?.enabled === true
    : (paid ? module.paid_enabled : module.trial_enabled) && override?.enabled !== false;
  if(!allowed) throw new Error("This builder is not enabled for your business.");
  return profile.tenant_id as string;
}

export const listBuilderDefinitions = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({kind:kindSchema}).parse(input))
  .handler(async ({data,context})=>{
    const tenantId = await authorize(context.userId,data.kind);
    const {data:rows,error}=await db.from("builder_definitions").select("id,name,description,configuration,is_active,updated_at")
      .eq("tenant_id",tenantId).eq("builder_key",data.kind).order("updated_at",{ascending:false});
    if(error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveBuilderDefinition = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({
    kind:kindSchema,id:idSchema.optional(),name:z.string().trim().min(2).max(120),
    description:z.string().max(500).default(""),
    configuration:configSchema,
    is_active:z.boolean().default(true),
  }).parse(input))
  .handler(async ({data,context})=>{
    const tenantId=await authorize(context.userId,data.kind);
    const payload={name:data.name,description:data.description,configuration:data.configuration,is_active:data.is_active,
      updated_at:new Date().toISOString()};
    if(data.id){
      const {data:updated,error}=await db.from("builder_definitions").update(payload)
        .eq("id",data.id).eq("tenant_id",tenantId).eq("builder_key",data.kind).select("id").maybeSingle();
      if(error) throw new Error(error.message);
      if(!updated) throw new Error("Builder definition not found in your business.");
      return updated;
    }
    const {data:created,error}=await db.from("builder_definitions").insert({
      ...payload,tenant_id:tenantId,builder_key:data.kind,created_by:context.userId,
    }).select("id").single();
    if(error) throw new Error(error.message);
    return created;
  });

export const archiveBuilderDefinition = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({kind:kindSchema,id:idSchema}).parse(input))
  .handler(async ({data,context})=>{
    const tenantId=await authorize(context.userId,data.kind);
    const {data:updated,error}=await db.from("builder_definitions")
      .update({is_active:false,updated_at:new Date().toISOString()})
      .eq("id",data.id).eq("tenant_id",tenantId).eq("builder_key",data.kind).select("id").maybeSingle();
    if(error) throw new Error(error.message);
    if(!updated) throw new Error("Builder definition not found.");
    return {ok:true};
  });
