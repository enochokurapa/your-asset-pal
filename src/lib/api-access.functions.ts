import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const admin = supabaseAdmin as any;

async function requireTenantAdmin(userId: string) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("tenant_id,tenant_role,is_saas_admin")
    .eq("id", userId)
    .single();
  if (error || !profile?.tenant_id) throw new Error("Workspace not found");
  if (profile.is_saas_admin) throw new Error("SaaS Admin cannot create tenant API keys");
  if (profile.tenant_role !== "tenant_admin") {
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Administrator privileges required");
  }
  return profile.tenant_id as string;
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await requireTenantAdmin(context.userId);
    const { data, error } = await admin
      .from("api_keys")
      .select("id,name,key_prefix,scopes,is_active,last_used_at,expires_at,created_at,revoked_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    name: z.string().trim().min(2).max(80),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await requireTenantAdmin(context.userId);
    const raw = `af_live_${randomBytes(24).toString("hex")}`;
    const hash = createHash("sha256").update(raw).digest("hex");
    const prefix = raw.slice(0, 16);
    const scopes = ["assets:read", "locations:read", "branches:read"];
    const { data: created, error } = await admin
      .from("api_keys")
      .insert({
        tenant_id: tenantId,
        name: data.name,
        key_prefix: prefix,
        key_hash: hash,
        scopes,
        is_active: true,
        created_by: context.userId,
      })
      .select("id,name,key_prefix,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { ...created, key: raw, scopes };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await requireTenantAdmin(context.userId);
    const { error } = await admin
      .from("api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
