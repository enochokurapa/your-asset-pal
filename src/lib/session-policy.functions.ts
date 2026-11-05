import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const db = supabaseAdmin as any;
const fields = "idle_user_minutes,idle_admin_minutes,idle_saas_minutes,password_expiry_days";
const schema = z.object({
  idle_user_minutes: z.number().int().min(5).max(240),
  idle_admin_minutes: z.number().int().min(5).max(120),
  idle_saas_minutes: z.number().int().min(5).max(60),
  password_expiry_days: z.union([z.literal(30),z.literal(60),z.literal(90),z.null()]),
});

async function activeProfile(userId: string) {
  const {data,error} = await db.from("profiles")
    .select("is_active,is_saas_admin,tenant_role,tenant_id").eq("id",userId).single();
  if(error || !data || data.is_active !== true) throw new Error("Active account required");
  return data;
}

export const getMySessionPolicy = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const p = await activeProfile(context.userId);
    const {data,error}=await db.from("saas_settings").select(fields).eq("id",true).single();
    if(error || !data) throw new Error("Session policy unavailable");
    let admin = p.tenant_role === "tenant_admin";
    if (!p.is_saas_admin && !admin) {
      const {data:role}=await db.from("user_roles").select("role")
        .eq("user_id",context.userId).eq("role","admin").maybeSingle();
      admin=Boolean(role);
    }
    return {
      inactivityMinutes: p.is_saas_admin ? data.idle_saas_minutes
        : admin ? data.idle_admin_minutes : data.idle_user_minutes,
    };
  });

export const getPlatformSessionPolicy = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const p=await activeProfile(context.userId);
    if (!p.is_saas_admin) throw new Error("SaaS administrator required");
    const {data,error}=await db.from("saas_settings").select(fields).eq("id",true).single();
    if(error || !data) throw new Error("Security policy unavailable");
    return data;
  });

export const setPlatformSessionPolicy = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>schema.parse(input))
  .handler(async ({data,context}) => {
    const p=await activeProfile(context.userId);
    if (!p.is_saas_admin) throw new Error("SaaS administrator required");
    const {error}=await db.from("saas_settings").update({
      ...data,updated_at:new Date().toISOString(),updated_by:context.userId,
    }).eq("id",true);
    if(error) throw new Error("Unable to save security policy");
    return {ok:true};
  });
