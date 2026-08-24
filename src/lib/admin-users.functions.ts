import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const admin = supabaseAdmin as any;

const roleSchema = z.enum(["admin", "manager", "staff", "security"]);
const moduleSchema = z.enum([
  "dashboard", "assets", "categories", "locations", "branches", "users",
  "reports", "audit", "depreciation", "gate_pass", "settings", "verification",
]);
const approvalSchema = z.enum([
  "movement", "retirement", "disposal", "reactivation", "set_for_disposal",
  "maintenance", "deletion", "attachment_deletion",
]);
const actionSchema = z.enum([
  "add_asset", "edit_asset", "edit_location",
  "initiate_movement", "initiate_retirement", "initiate_disposal", "initiate_maintenance",
  "manage_depreciation", "run_depreciation", "override_depreciation",
  "request_gate_pass", "approve_gate_pass", "verify_gate_pass",
  "view_gate_pass_reports", "export_gate_pass_reports", "manage_document_templates",
  "request_asset_deletion", "approve_asset_deletion",
  "request_attachment_deletion", "approve_attachment_deletion",
  "perform_verification", "view_verification_reports", "approve_own_request", "manage_audit_log",
]);

async function getTenantAdminProfile(userId: string) {
  if (!userId) throw new Error("Tenant administrator privileges required: Not authenticated");
  const [{ data: role, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    admin.from("profiles").select("id,tenant_id,tenant_role,is_saas_admin").eq("id", userId).single(),
  ]);
  if (roleError) throw new Error(roleError.message);
  if (profileError || !profile) throw new Error("Administrator profile is not configured");

  // SaaS administrators control the platform from /saas-admin. They are intentionally
  // not tenant administrators and cannot mutate tenant-user roles/permissions here.
  if (profile.is_saas_admin) {
    throw new Error("SaaS administrators manage platform policy, not tenant users");
  }
  if (!role && profile.tenant_role !== "tenant_admin") {
    throw new Error("Tenant administrator privileges required");
  }
  if (!profile.tenant_id) throw new Error("No tenant is assigned to this administrator");
  return profile;
}

async function assertSameTenant(adminUserId: string, targetUserId: string) {
  const p = await getTenantAdminProfile(adminUserId);
  const { data: target, error } = await admin.from("profiles")
    .select("tenant_id,is_saas_admin")
    .eq("id", targetUserId)
    .single();
  if (error || !target || target.tenant_id !== p.tenant_id) {
    throw new Error("You cannot manage a user from another tenant");
  }
  if (target.is_saas_admin) throw new Error("Tenant administrators cannot manage the SaaS administrator account");
  return p;
}

async function enforceSeatLimit(tenantId: string) {
  const [{ data: tenant }, { data: settings }, { count }] = await Promise.all([
    admin.from("tenants").select("subscription_status,trial_ends_at").eq("id", tenantId).single(),
    admin.from("saas_settings").select("trial_user_limit").eq("id", true).single(),
    admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("is_saas_admin", false),
  ]);
  const trialStillValid = tenant?.subscription_status === "trial" && new Date(tenant.trial_ends_at).getTime() > Date.now();
  if (tenant?.subscription_status === "trial" && !trialStillValid) {
    throw new Error("Your 4-week free trial has expired. Upgrade to add users.");
  }
  if (trialStillValid && (count ?? 0) >= Number(settings?.trial_user_limit ?? 4)) {
    throw new Error(`Free trial is limited to ${settings?.trial_user_limit ?? 4} active tenant users. Upgrade to add more users.`);
  }
}

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    email: z.string().email(),
    password: z.string().min(6).max(72),
    full_name: z.string().min(1).max(200),
    role: roleSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await getTenantAdminProfile(context.userId);
    await enforceSeatLimit(p.tenant_id);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, must_change_password: true },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    const { error: profileError } = await admin.from("profiles").update({
      full_name: data.full_name,
      must_change_password: true,
      tenant_id: p.tenant_id,
      tenant_role: data.role === "admin" ? "tenant_admin" : "member",
      is_active: true,
      is_saas_admin: false,
    }).eq("id", uid);
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(profileError.message);
    }

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
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    new_password: z.string().min(6).max(72),
  }).parse(input))
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
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    active: z.boolean(),
  }).parse(input))
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
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), role: roleSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.user_id === context.userId && data.role === "admin" && !data.enabled) {
      throw new Error("You cannot remove your own tenant administrator role");
    }
    if (data.enabled) {
      const { error } = await admin.from("user_roles").upsert(
        { user_id: data.user_id, role: data.role },
        { onConflict: "user_id,role" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    if (data.role === "admin") {
      await admin.from("profiles").update({ tenant_role: data.enabled ? "tenant_admin" : "member" }).eq("id", data.user_id);
    }
    return { ok: true };
  });

export const setUserModulePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), module: moduleSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.enabled) {
      const { error } = await admin.from("user_permissions").upsert(
        { user_id: data.user_id, module: data.module, can_view: true },
        { onConflict: "user_id,module" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_permissions").delete().eq("user_id", data.user_id).eq("module", data.module);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserApprovalRight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), approval_kind: approvalSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.enabled) {
      const { error } = await admin.from("user_approval_rights").upsert(
        { user_id: data.user_id, approval_kind: data.approval_kind },
        { onConflict: "user_id,approval_kind" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_approval_rights").delete().eq("user_id", data.user_id).eq("approval_kind", data.approval_kind);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserActionRight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), action_kind: actionSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.enabled) {
      const { error } = await admin.from("user_action_rights").upsert(
        { user_id: data.user_id, action_kind: data.action_kind },
        { onConflict: "user_id,action_kind" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_action_rights").delete().eq("user_id", data.user_id).eq("action_kind", data.action_kind);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserBranchAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), branch_id: z.string().uuid(), enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id);
    if (data.enabled) {
      const { error } = await admin.from("user_branch_access").upsert(
        { user_id: data.user_id, branch_id: data.branch_id },
        { onConflict: "user_id,branch_id" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("user_branch_access").delete().eq("user_id", data.user_id).eq("branch_id", data.branch_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });