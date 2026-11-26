import { passwordPolicyError } from "@/lib/password-policy";
import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {queryPostgres} from "@/lib/postgres.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const admin = supabaseAdmin as any;
async function auditBusinessSupport(context:{userId:string;supportSessionId?:string|null;supportTenantId?:string|null},
 action:string,details:Record<string,unknown>){
 if(!context.supportSessionId||!context.supportTenantId)return;
 await queryPostgres(
  "INSERT INTO public.platform_tenant_security_events(session_id,tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5::jsonb)",
  [context.supportSessionId,context.supportTenantId,context.userId,action,JSON.stringify(details)]
 );
}


async function sendNewUserWelcomeEmail(email:string,fullName:string):Promise<boolean>{
  const key=process.env.RESEND_API_KEY;
  if(!key){console.warn("[Account Welcome] Transactional email is not configured");return false;}
  const safeName=fullName.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
  const markup=`<!doctype html><html><body style="margin:0;padding:32px 12px;background:#f8fafc;font-family:Arial,sans-serif;color:#182333"><table role="presentation" style="width:100%;max-width:560px;margin:auto;border-collapse:collapse;border:1px solid #e2e8f0;background:#fff"><tr><td style="padding:30px"><p style="font-size:20px;color:#2563eb;font-weight:700">AssetFlow360</p><h1 style="font-size:24px">Your workspace account is ready</h1><p>Hello ${safeName},</p><p>An administrator has created your AssetFlow360 account. Use your registered email and the temporary sign-in credentials supplied securely by your administrator. You will be asked to choose a new password.</p><p style="margin:26px 0"><a href="https://assetflow360.com/login" style="background:#2563eb;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px">Open AssetFlow360</a></p><p style="font-size:13px;color:#64748b">For your security, passwords are never sent in this email. If you weren't expecting an account, contact your organization's administrator.</p></td></tr></table></body></html>`;
  try{
    const result=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({from:"AssetFlow360 <noreply@assetflow360.com>",to:[email],subject:"Welcome to AssetFlow360",html:markup}),
      signal:AbortSignal.timeout(8000),
    });
    if(!result.ok){console.error("[Account Welcome] Email provider rejected message with status",result.status);return false;}
    return true;
  }catch(error){console.error("[Account Welcome] Delivery request failed",error instanceof Error?error.name:"Unknown error");return false;}
}


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

async function getTenantAdminProfile(userId: string,supportTenantId?:string|null) {
  if (!userId) throw new Error("Administrator privileges required: Not authenticated");
  const [{ data: role, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    admin.from("profiles").select("id,tenant_id,tenant_role,is_saas_admin,is_active").eq("id", userId).single(),
  ]);
  if (roleError) throw new Error(roleError.message);
  if (profileError || !profile || profile.is_active !== true) throw new Error("Active administrator profile is required");

  if (profile.is_saas_admin) {
    if(!supportTenantId)throw new Error("Open a business support session before managing customer users");
    return {...profile,tenant_id:supportTenantId,tenant_role:"tenant_admin"};
  }
  if (!role && profile.tenant_role !== "tenant_admin") {
    throw new Error("Administrator privileges required");
  }
  if (!profile.tenant_id) throw new Error("No workspace is assigned to this administrator");
  return profile;
}

async function assertSameTenant(adminUserId: string, targetUserId: string,supportTenantId?:string|null) {
  const p = await getTenantAdminProfile(adminUserId,supportTenantId);
  const target = (await queryPostgres<{tenant_id:string;is_saas_admin:boolean;archived_at:string|null}>(
    "SELECT tenant_id,is_saas_admin,archived_at FROM public.profiles WHERE id=$1",[targetUserId]))[0];
  if (!target || target.tenant_id !== p.tenant_id) {
    throw new Error("You cannot manage a user from another workspace");
  }
  if (target.is_saas_admin) throw new Error("Admins cannot manage the SaaS Admin account");
  if (target.archived_at) throw new Error("This user has already been removed from the workspace");
  return p;
}

async function enforceSeatLimit(tenantId:string) {
  const [state]=await queryPostgres<{seat_limit:number|null;subscription_valid:boolean;used:number}>(
    "SELECT c.seat_limit,c.subscription_valid,(SELECT count(*)::int FROM public.profiles WHERE tenant_id=$1 AND is_active=true AND is_saas_admin=false) AS used FROM public.user_seat_capacity($1) c",[tenantId]);
  if(!state?.subscription_valid)throw new Error("Renew or activate your subscription before adding users.");
  if(state.seat_limit!==null && state.used>=state.seat_limit)throw new Error("All user licenses are in use. Deactivate a user or purchase additional seats.");
}

/** Tenant-scoped read model for the users dashboard. Mutation enforcement remains server-side. */
export const getUserLicenseOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await getTenantAdminProfile(context.userId, context.supportTenantId);
    const activeActor = (await queryPostgres<{is_active:boolean}>(
      "SELECT is_active FROM public.profiles WHERE id=$1", [context.userId]))[0];
    if (!activeActor?.is_active) throw new Error("Active administrator required");
    const tenantId = p.tenant_id;
    const [capacity, counts, archived, events, transfers] = await Promise.all([
      queryPostgres<{seat_limit:number|null;subscription_valid:boolean}>("SELECT * FROM public.user_seat_capacity($1)",[tenantId]),
      queryPostgres<{active:number;inactive:number;archived:number}>(
        "SELECT count(*) FILTER (WHERE is_active=true)::int AS active, count(*) FILTER (WHERE is_active=false AND archived_at IS NULL)::int AS inactive, count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived FROM public.profiles WHERE tenant_id=$1 AND is_saas_admin=false", [tenantId]),
      queryPostgres<{id:string;full_name:string|null;email:string|null;archived_at:string}>(
        "SELECT id,full_name,email,archived_at FROM public.profiles WHERE tenant_id=$1 AND is_saas_admin=false AND archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 100", [tenantId]),
      queryPostgres<{id:string;action:string;created_at:string;target_name:string|null;actor_name:string|null}>(
        "SELECT a.id::text,a.action,a.created_at::text,coalesce(t.full_name,t.email) AS target_name,coalesce(u.full_name,u.email) AS actor_name FROM public.audit_log a LEFT JOIN public.profiles t ON t.id::text=a.entity_id::text AND t.tenant_id=a.tenant_id LEFT JOIN public.profiles u ON u.id=a.actor_user_id AND u.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND a.entity_type='profile' AND a.action IN ('user_access_removed','user_created','user_deactivated','user_reactivated','user_license_transferred') ORDER BY a.created_at DESC LIMIT 100", [tenantId]),
      queryPostgres<{id:string;source_name:string;source_email:string;target_name:string;target_email:string;target_role:string;actor_name:string;reason:string;created_at:string;seats_before:number;seats_after:number;seat_limit:number|null}>(
        "SELECT id,source_name,source_email,target_name,target_email,target_role,actor_name,reason,created_at::text,seats_before,seats_after,seat_limit FROM public.user_license_events WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",[tenantId]),
    ]);
    if(!capacity[0])throw new Error("Unable to load subscription capacity");
    const count=counts[0]??{active:0,inactive:0,archived:0};
    const {seat_limit:limit,subscription_valid:subscriptionValid}=capacity[0];
    const available=limit===null?null:Math.max(0,limit-count.active);
    return {...count,limit,available,subscriptionValid,canAdd:subscriptionValid&&(available===null||available>0),archivedUsers:archived,events,transfers};
  });


export const transferUserLicense = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({
   source_user_id:z.string().uuid(),request_id:z.string().uuid(),
   full_name:z.string().trim().min(1).max(200),
   email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),
   password:z.string().min(8).max(72).refine(v=>passwordPolicyError(v)===null,"Use uppercase, lowercase, a number and symbol; avoid four ascending or descending digits."),
   role:roleSchema,reason:z.string().trim().min(5).max(500),
 }).parse(input))
 .handler(async({data,context})=>{
   const p=await getTenantAdminProfile(context.userId,context.supportTenantId);
   const [actor]=await queryPostgres<{is_active:boolean;archived_at:string|null}>("SELECT is_active,archived_at FROM public.profiles WHERE id=$1",[context.userId]);
   if(!actor?.is_active||actor.archived_at)throw new Error("Active administrator required");
   if(data.source_user_id===context.userId)throw new Error("You cannot transfer your own license");
   const findReceipt=async()=>{
     const [receipt]=await queryPostgres<{id:string;source_user_id:string;target_email:string;target_role:string;reason:string}>(
       "SELECT id,source_user_id,target_email,target_role,reason FROM public.user_license_events WHERE request_id=$1 AND tenant_id=$2 AND actor_id=$3",
       [data.request_id,p.tenant_id,context.userId]);
     if(receipt&&(receipt.source_user_id!==data.source_user_id||receipt.target_email.toLowerCase()!==data.email||receipt.target_role!==data.role||receipt.reason!==data.reason))throw new Error("Transfer request already used with different details");
     return receipt;
   };
   const existing=await findReceipt();
   if(existing)return {id:existing.id,welcomeEmailAccepted:null,replayed:true};
   await assertSameTenant(context.userId,data.source_user_id,context.supportTenantId);
   const [preflight]=await queryPostgres<{subscription_valid:boolean;seat_limit:number|null;used:number;source_active:boolean}>(
     "SELECT c.subscription_valid,c.seat_limit,(SELECT count(*)::int FROM public.profiles WHERE tenant_id=$1 AND is_active=true AND is_saas_admin=false) AS used,EXISTS(SELECT 1 FROM public.profiles WHERE id=$2 AND tenant_id=$1 AND is_active=true AND archived_at IS NULL AND is_saas_admin=false) AS source_active FROM public.user_seat_capacity($1) c",
     [p.tenant_id,data.source_user_id]);
   if(!preflight?.subscription_valid||!preflight.source_active||(preflight.seat_limit!==null&&preflight.used>preflight.seat_limit))throw new Error("Transfer unavailable. Check the source account and subscription.");
   // Prepare a fresh identity with an unknown random password before setting the
   // supplied temporary password and ban. The identity is not a workspace member.
   const {data:created,error:creationError}=await supabaseAdmin.auth.admin.createUser({
      email:data.email,password:"Aa9!"+randomBytes(24).toString("hex"),email_confirm:true,
      user_metadata:{full_name:data.full_name,must_change_password:true}
   });
   if(creationError||!created.user)throw new Error(creationError?.message||"Unable to prepare replacement account");
   const uid=created.user.id;
   const cleanStaged=async()=>{
      const [stage]=await queryPostgres<{tenant_id:string|null}>("SELECT tenant_id FROM public.profiles WHERE id=$1",[uid]);
      if(!stage||stage.tenant_id!==null)return false;
      const {error}=await supabaseAdmin.auth.admin.deleteUser(uid);
      return !error;
   };
   try{
     const {error}=await supabaseAdmin.auth.admin.updateUserById(uid,{password:data.password,ban_duration:"876000h",user_metadata:{full_name:data.full_name,must_change_password:true}});
     if(error)throw new Error("Unable to secure the replacement account");
   }catch(error){
     const cleaned=await cleanStaged().catch(()=>false);
     if(!cleaned)throw new Error("Replacement preparation failed; contact support to reconcile the unassigned account.");
     throw error;
   }
   let eventId:string;
   try{
     const [result]=await queryPostgres<{id:string}>("SELECT public.transfer_user_license($1,$2,$3,$4,$5,$6::public.app_role,$7,$8) AS id",
       [p.tenant_id,context.userId,context.supportSessionId??null,data.source_user_id,uid,data.role,data.reason,data.request_id]);
     if(!result?.id)throw new Error("Transfer result could not be confirmed");
     eventId=result.id;
   }catch(error){
     // A network failure can occur AFTER COMMIT. Never delete an account if
     // the transaction outcome is uncertain. Check the durable receipt first.
     let receipt:Awaited<ReturnType<typeof findReceipt>>;
     try{receipt=await findReceipt();}catch{throw new Error("Transfer outcome is uncertain. Refresh License History before retrying; contact support if unresolved.");}
     if(receipt)return {id:receipt.id,welcomeEmailAccepted:null,replayed:true};
     const code=(error as {code?:string})?.code;
     // PostgreSQL statement rejection explicitly proves rollback. Transport
     // errors, timeouts and unknown results do not.
     if(code&&["P0001","23505","23514","23503","40001","40P01"].includes(code)){
       const cleaned=await cleanStaged().catch(()=>false);
       if(!cleaned)throw new Error("Transfer rejected; contact support to remove the unassigned replacement account.");
       throw new Error(code==="P0001"&&error instanceof Error?error.message:"Transfer rejected; refresh users and retry.");
     }
     throw new Error("Transfer outcome is uncertain. Refresh License History before retrying; contact support if unresolved.");
   }
   const welcomeEmailAccepted=await sendNewUserWelcomeEmail(data.email,data.full_name);
   return {id:eventId,welcomeEmailAccepted,replayed:false};
 });

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    email: z.string().email(),
    password: z.string().min(8).max(72).refine(v=>passwordPolicyError(v)===null,"Password must meet the account security policy."),
    full_name: z.string().min(1).max(200),
    role: roleSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await getTenantAdminProfile(context.userId,context.supportTenantId);
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
    const welcomeEmailAccepted=await sendNewUserWelcomeEmail(data.email.trim().toLowerCase(),data.full_name);
    await auditBusinessSupport(context,"tenant_user_created",{targetUserId:uid,role:data.role});
    return { id: uid, welcomeEmailAccepted };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    new_password: z.string().min(8).max(72).refine(v=>passwordPolicyError(v)===null,"Password must meet the account security policy."),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
      user_metadata: { must_change_password: true },
    });
    if (error) throw new Error(error.message);
    await admin.from("profiles").update({ must_change_password: true }).eq("id", data.user_id);
    await auditBusinessSupport(context,"tenant_user_password_reset",{targetUserId:data.user_id});
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    active: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
    if (data.user_id === context.userId && !data.active) throw new Error("You cannot deactivate your own account");
    if (data.active) await enforceSeatLimit(p.tenant_id);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    await admin.from("profiles").update({ is_active: data.active }).eq("id", data.user_id);
    await auditBusinessSupport(context,"tenant_user_status_changed",{targetUserId:data.user_id,active:data.active});
    return { ok: true };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    // Preserve historical assets, assignments and audit records. Ban the account
    // first and archive its profile rather than cascading auth.users deletion.
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration:"876000h"
    });
    if (banError) throw new Error("Unable to revoke account login: "+banError.message);
    // Direct PostgreSQL avoids stale PostgREST schema-cache failures for archived_at.
    const archived=await queryPostgres<{id:string}>(
      "UPDATE public.profiles SET is_active=false,archived_at=now() WHERE id=$1 AND tenant_id=$2 AND archived_at IS NULL RETURNING id",
      [data.user_id,context.supportTenantId??(await getTenantAdminProfile(context.userId,context.supportTenantId)).tenant_id]);
    if(!archived.length)throw Error("Account archive was not completed. Access remains blocked; contact an administrator.");
    await queryPostgres(
      "INSERT INTO public.audit_log(tenant_id,entity_type,entity_id,action,actor_user_id,details) VALUES($1,'profile',$2,'user_access_removed',$3,$4::jsonb)",
      [context.supportTenantId??(await getTenantAdminProfile(context.userId,context.supportTenantId)).tenant_id,
       data.user_id,context.userId,JSON.stringify({accessRevoked:true,historyRetained:true})]
    );
    await auditBusinessSupport(context,"tenant_user_access_removed",{
      targetUserId:data.user_id,retainedHistory:true
    });
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), role: roleSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
    if (data.user_id === context.userId && data.role === "admin" && !data.enabled) {
      throw new Error("You cannot remove your own admin role");
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
    await auditBusinessSupport(context,"tenant_user_role_changed",{targetUserId:data.user_id,role:data.role,enabled:data.enabled});
    return { ok: true };
  });

export const setUserModulePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), module: moduleSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
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
    await auditBusinessSupport(context,"tenant_user_module_changed",{targetUserId:data.user_id,module:data.module,enabled:data.enabled});
    return { ok: true };
  });

export const setUserApprovalRight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), approval_kind: approvalSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
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
    await auditBusinessSupport(context,"tenant_user_approval_changed",{targetUserId:data.user_id,kind:data.approval_kind,enabled:data.enabled});
    return { ok: true };
  });

export const setUserActionRight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), action_kind: actionSchema, enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
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
    await auditBusinessSupport(context,"tenant_user_action_changed",{targetUserId:data.user_id,kind:data.action_kind,enabled:data.enabled});
    return { ok: true };
  });

export const setUserBranchAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(), branch_id: z.string().uuid(), enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSameTenant(context.userId, data.user_id,context.supportTenantId);
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
    await auditBusinessSupport(context,"tenant_user_branch_changed",{targetUserId:data.user_id,branchId:data.branch_id,enabled:data.enabled});
    return { ok: true };
  });
