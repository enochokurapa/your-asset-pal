import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const admin = supabaseAdmin as any;

async function getAdminProfile(userId: string) {
  if (!userId) throw new Error("Admin privileges required: Not authenticated");
  const [{ data: role, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    admin.from("profiles").select("id,tenant_id,tenant_role,is_saas_admin").eq("id", userId).single(),
  ]);
  if (roleError) throw new Error(roleError.message);
  if (profileError || !profile) throw new Error("Administrator profile is not configured");
  if (!role && !profile.is_saas_admin) throw new Error("Admin privileges required: Your account does not have Admin rights");
  if (!profile.tenant_id) throw new Error("No tenant is assigned to this administrator");
  return profile;
}

async function assertSameTenant(adminUserId: string, targetUserId: string) {
  const p = await getAdminProfile(adminUserId);
  const { data: target } = await admin.from("profiles").select("tenant_id").eq("id", targetUserId).single();
  if (!target || target.tenant_id !== p.tenant_id) throw new Error("You cannot manage a user from another tenant");
  return p;
}

async function enforceSeatLimit(tenantId: string) {
  const [{ data: tenant }, { data: settings }, { count }] = await Promise.all([
    admin.from("tenants").select("subscription_status,trial_ends_at").eq("id", tenantId).single(),
    admin.from("saas_settings").select("trial_user_limit").eq("id", true).single(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
  ]);
  const trialStillValid = tenant?.subscription_status === "trial" && new Date(tenant.trial_ends_at).getTime() > Date.now();
  if (tenant?.subscription_status === "trial" && !trialStillValid) {
    throw new Error("Your 4-week free trial has expired. Upgrade to add users.");
  }
  if (trialStillValid && (count ?? 0) >= Number(settings?.trial_user_limit ?? 4)) {
    throw new Error(`Free trial is limited to ${settings?.trial_user_limit ?? 4} active users. Upgrade to add more users.`);
  }
}

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(72),
      full_name: z.string().min(1).max(200),
      role: z.enum(["admin", "manager", "staff", "security"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const p = await getAdminProfile(context.userId);
    await enforceSeatLimit(p.tenant_id);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, must_change_password: true },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    // The DB trigger creates a profile; attach it to this tenant and require first-login password change.
    const { error: profileError } = await admin.from("profiles").update({
      full_name: data.full_name,
      must_change_password: true,
      tenant_id: p.tenant_id,
      tenant_role: data.role === "admin" ? "tenant_admin" : "member",
      is_active: true,
    }).eq("id", uid);
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(profileError.message);
    }

    // The trigger creates staff by default. Replace it with the selected single initial role.
    await admin.from("user_roles").delete().eq("user_id", uid);
    const { error: roleError } = await admin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(roleError.message);
    }
    return { id: uid };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      new_password: z.string().min(6).max(72),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
      user_metadata: { must_change_password: true },
    });
    if (error) throw new Error(error.message);
    await admin.from("profiles").update({ must_change_password: true }).eq("id", data.user_id);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const p = await assertSameTenant(context.userId, data.user_id);
    if (data.user_id === context.userId && !data.active) throw new Error("You cannot deactivate your own account");
    if (data.active) await enforceSeatLimit(p.tenant_id);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    await admin.from("profiles").update({ is_active: data.active }).eq("id", data.user_id);
    return { ok: true };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
