import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

async function getActiveTenantProfile(userId: string) {
  const { data: profile, error } = await db.from("profiles")
    .select("tenant_id,tenant_role,is_active").eq("id",userId).maybeSingle();
  if (error || !profile?.tenant_id || profile.is_active !== true)
    throw new Error("An active business account is required.");
  return profile as {tenant_id:string;tenant_role:string;is_active:boolean};
}

export async function readAssetVerificationPolicy(userId: string) {
  const profile = await getActiveTenantProfile(userId);
  const { data, error } = await db.from("tenants")
    .select("asset_verification_interval_months").eq("id", profile.tenant_id).single();
  if (error || !data) throw new Error("Unable to load the business verification policy.");
  return { intervalMonths: data.asset_verification_interval_months as number };
}

export async function changeAssetVerificationPolicy(userId: string, intervalMonths: number) {
  const profile = await getActiveTenantProfile(userId);
  let isAuthorized = profile.tenant_role === "tenant_admin";
  if (!isAuthorized) {
    const { data, error } = await db.from("user_roles")
      .select("role").eq("user_id",userId).eq("role","admin").maybeSingle();
    if (error) throw new Error("Unable to verify administrator permissions.");
    isAuthorized = Boolean(data);
  }
  if (!isAuthorized) throw new Error("Only your business administrator can change the verification interval.");
  const { error } = await db.from("tenants")
    .update({asset_verification_interval_months:intervalMonths})
    .eq("id",profile.tenant_id);
  if (error) throw new Error("Unable to save the verification interval.");
  return { saved:true,intervalMonths };
}
