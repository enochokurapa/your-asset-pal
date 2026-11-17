import {queueTenantActivationNotice} from "@/lib/platform-operations-notices.server";
import {getPostgresPool} from "@/lib/postgres.server";
import {randomUUID} from "node:crypto";
import { getYoCheckoutConfig, isYoCheckoutConfigured } from "@/lib/payment-gateway.server";
import { ugandanMobileMoneyPhoneSchema } from "@/lib/uganda-mobile-money";
import { currentUsdUgxQuote, usdToUgx } from "@/lib/pricing-fx.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveTxt } from "node:dns/promises";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { queryPostgres } from "@/lib/postgres.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const admin = supabaseAdmin as any;

async function getProfile(userId: string) {
  const { data, error } = await admin.from("profiles")
    .select("id,email,tenant_id,tenant_role,is_saas_admin,is_active")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("User profile is not configured for SaaS access");
  return data;
}

async function assertTenantAdmin(userId: string) {
  const p = await getProfile(userId);

  if (p.is_saas_admin) {
    throw new Error("SaaS Admin cannot perform workspace billing actions");
  }

  const { data: adminRole, error: roleError } = await admin.from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw new Error(roleError.message);

  const canManageTenant = p.tenant_role === "tenant_admin" || Boolean(adminRole);
  if (!canManageTenant) throw new Error("Administrator privileges required");
  if (!p.tenant_id) throw new Error("No workspace is assigned to this account");

  if (p.tenant_role !== "tenant_admin" && adminRole) {
    const { error: repairError } = await admin.from("profiles")
      .update({ tenant_role: "tenant_admin" })
      .eq("id", userId)
      .eq("is_saas_admin", false);
    if (repairError) throw new Error(repairError.message);
    p.tenant_role = "tenant_admin";
  }

  return p;
}

async function assertSaasAdmin(userId: string) {
  const p = await getProfile(userId);
  if (!p.is_saas_admin) throw new Error("SaaS administrator privileges required");
  return p;
}

function computeStatus(tenant: any) {
  if (!tenant) return "expired";
  if (tenant.subscription_status === "active" || tenant.subscription_status === "suspended") {
    return tenant.subscription_status;
  }
  if (tenant.subscription_status === "trial") {
    return new Date(tenant.trial_ends_at).getTime() > Date.now() ? "trial" : "expired";
  }
  return "expired";
}

function parseSaasSettings(settings: any) {
  if (!settings) throw new Error("Global SaaS settings are not configured");
  const trialDays = Number(settings.trial_days);
  const trialUserLimit = Number(settings.trial_user_limit);
  const paidPrice = Number(settings.paid_price);
  const currency = String(settings.currency || "").toUpperCase();
  if (!Number.isInteger(trialDays) || trialDays < 1) throw new Error("Global trial duration is invalid");
  if (!Number.isInteger(trialUserLimit) || trialUserLimit < 1) throw new Error("Global trial user limit is invalid");
  if (!Number.isFinite(paidPrice) || paidPrice < 0) throw new Error("Global paid-plan price is invalid");
  if (!currency) throw new Error("Global SaaS currency is invalid");
  return { trialDays, trialUserLimit, paidPrice, currency };
}

function normalizePlatformLogo(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  if (dataUrl.length > 2_800_000) throw new Error("Logo is too large. Keep the file under 2 MB.");

  const match = dataUrl.match(/^data:(image\/(?:png|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Use a PNG, WebP or SVG logo.");

  const mime = match[1];
  const payload = match[2];
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length || bytes.length > 2_000_000) {
    throw new Error("Logo is too large. Keep the file under 2 MB.");
  }

  if (mime === "image/png") {
    const signature = bytes.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") throw new Error("The uploaded PNG is not valid.");
  } else if (mime === "image/webp") {
    if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
      throw new Error("The uploaded WebP is not valid.");
    }
  } else {
    const svg = bytes.toString("utf8").trim();
    if (!/<svg(?:\s|>)/i.test(svg)) throw new Error("The uploaded SVG is not valid.");
    if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(svg)) {
      throw new Error("The SVG contains unsupported active content.");
    }
  }

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export const getPublicSaasBranding = createServerFn({ method: "GET" })
  .handler(async () => {
    const [data] = await queryPostgres<{
      platform_name: string | null;
      platform_logo_data_url: string | null;
      platform_icon_data_url: string | null;
      platform_primary_color: string | null;
      platform_secondary_color: string | null;
    }>("SELECT platform_name, platform_logo_data_url, platform_icon_data_url, platform_primary_color, platform_secondary_color FROM public.saas_settings WHERE id = TRUE LIMIT 1");
    return {
      name: data?.platform_name || "AssetFlow 360",
      logoDataUrl: data?.platform_logo_data_url || null,
      iconDataUrl: data?.platform_icon_data_url || null,
      primaryColor: data?.platform_primary_color || "#C77435",
      secondaryColor: data?.platform_secondary_color || "#4B47DC",
    };
  });

export const updateSaasBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    platform_name: z.string().trim().min(2).max(80).optional(),
    logo_data_url: z.string().nullable().optional(),
    icon_data_url: z.string().nullable().optional(),
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);

    const [current] = await queryPostgres<{
      platform_name: string | null;
      platform_logo_data_url: string | null;
      platform_icon_data_url: string | null;
      platform_primary_color: string | null;
      platform_secondary_color: string | null;
    }>("SELECT platform_name, platform_logo_data_url, platform_icon_data_url, platform_primary_color, platform_secondary_color FROM public.saas_settings WHERE id = TRUE LIMIT 1");
    if (!current) throw new Error("Platform branding is not configured");

    const logo = data.logo_data_url === undefined
      ? current.platform_logo_data_url
      : normalizePlatformLogo(data.logo_data_url);
    const icon = data.icon_data_url === undefined
      ? current.platform_icon_data_url
      : normalizePlatformLogo(data.icon_data_url);
    const platformName = data.platform_name ?? current.platform_name ?? "AssetFlow 360";
    const primaryColor = (data.primary_color ?? current.platform_primary_color ?? "#C77435").toUpperCase();
    const secondaryColor = (data.secondary_color ?? current.platform_secondary_color ?? "#4B47DC").toUpperCase();

    await queryPostgres(
      `UPDATE public.saas_settings
       SET platform_name = $1,
           platform_logo_data_url = $2,
           platform_icon_data_url = $3,
           platform_primary_color = $4,
           platform_secondary_color = $5,
           updated_at = NOW(),
           updated_by = $6
       WHERE id = TRUE`,
      [platformName, logo, icon, primaryColor, secondaryColor, context.userId],
    );
    return {
      ok: true,
      name: platformName,
      logoDataUrl: logo,
      iconDataUrl: icon,
      primaryColor,
      secondaryColor,
    };
  });

export const provisionFreeTrialWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    organization_name: z.string().trim().min(2).max(160),
    full_name: z.string().trim().min(2).max(160),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const profile = await getProfile(context.userId);
    if (profile.is_saas_admin) throw new Error("Platform administrators cannot create a trial workspace");
    if (profile.tenant_id) throw new Error("This account already belongs to a workspace");

    const { data: settings, error: settingsError } = await admin.from("saas_settings")
      .select("trial_days,trial_user_limit,paid_price,currency")
      .eq("id", true)
      .single();
    if (settingsError || !settings) {
      throw new Error(settingsError?.message || "Free-trial policy is not configured");
    }
    const parsed = parseSaasSettings(settings);

    const baseSlug = data.organization_name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "workspace";
    const slug = `${baseSlug}-${context.userId.replace(/-/g, "").slice(0, 10)}`;

    let tenantId: string | null = null;
    try {
      const { data: tenant, error: tenantError } = await admin.from("tenants")
        .insert({
          name: data.organization_name,
          slug,
          subscription_status: "trial",
          plan_code: "trial",
        })
        .select("id,trial_ends_at")
        .single();
      if (tenantError || !tenant) throw new Error(tenantError?.message || "Could not create workspace");
      tenantId = tenant.id;

      const { error: profileError } = await admin.from("profiles").update({
        full_name: data.full_name,
        tenant_id: tenantId,
        tenant_role: "tenant_admin",
        is_active: true,
        is_saas_admin: false,
        must_change_password: false,
      }).eq("id", context.userId).is("tenant_id", null);
      if (profileError) throw new Error(profileError.message);

      const { error: deleteRoleError } = await admin.from("user_roles")
        .delete()
        .eq("user_id", context.userId);
      if (deleteRoleError) throw new Error(deleteRoleError.message);

      const { error: roleError } = await admin.from("user_roles").insert({
        user_id: context.userId,
        role: "admin",
      });
      if (roleError) throw new Error(roleError.message);

      const { error: templateError } = await admin.from("document_templates").insert({
        tenant_id: tenantId,
        name: "Default",
        is_active: true,
        organization_name: data.organization_name,
        updated_by: context.userId,
      });
      if (templateError && !/duplicate/i.test(templateError.message)) {
        throw new Error(templateError.message);
      }

      return {
        ok: true,
        tenantId,
        trialDays: parsed.trialDays,
        trialEndsAt: tenant.trial_ends_at,
      };
    } catch (error) {
      if (tenantId) {
        await admin.from("profiles").update({
          tenant_id: null,
          tenant_role: "member",
        }).eq("id", context.userId).eq("tenant_id", tenantId);
        await admin.from("user_roles").delete().eq("user_id", context.userId);
        await admin.from("user_roles").insert({ user_id: context.userId, role: "staff" });
        await admin.from("tenants").delete().eq("id", tenantId);
      }
      throw error;
    }
  });

export const getSaasContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await getProfile(context.userId);
    const [tenantResult, settingsResult, modulesResult, overridesResult] = await Promise.all([
      admin.from("tenants").select("*").eq("id", profile.tenant_id).maybeSingle(),
      admin.from("saas_settings").select("*").eq("id", true).single(),
      admin.from("saas_modules").select("*").order("sort_order"),
      profile.tenant_id
        ? admin.from("tenant_module_overrides").select("module_key,enabled").eq("tenant_id", profile.tenant_id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (tenantResult.error) throw new Error(tenantResult.error.message);
    if (settingsResult.error || !settingsResult.data) {
      throw new Error(settingsResult.error?.message || "Global SaaS settings are not configured");
    }
    if (modulesResult.error) throw new Error(modulesResult.error.message);
    if (overridesResult.error) throw new Error(overridesResult.error.message);

    const tenant = tenantResult.data;
    const settings = settingsResult.data;
    const modules = modulesResult.data ?? [];
    const overrides = overridesResult.data ?? [];
    const parsedSettings = parseSaasSettings(settings);
    const status = computeStatus(tenant);
    const paid = status === "active";
    const {data:assignedPlan}=tenant?.plan_code&&["starter","business","enterprise"].includes(tenant.plan_code)?await admin.from("saas_pricing_plans").select("included_assets,included_users,enabled_modules").eq("id",tenant.plan_code).maybeSingle():{data:null};
    const planAllowed=assignedPlan?new Set(assignedPlan.enabled_modules??[]):null;
    const overrideMap = new Map(overrides.map((x: any) => [x.module_key, x.enabled]));
    const enabledModules = modules
      .filter((m: any) => {
        if (!m.globally_enabled) return false;
        if (m.billing_model === "add_on") return overrideMap.get(m.module_key) === true;
        const planEnabled = paid ? m.paid_enabled : m.trial_enabled;
        if (!planEnabled || (paid && planAllowed && !planAllowed.has(m.module_key))) return false;
        return !overrideMap.has(m.module_key) || overrideMap.get(m.module_key) !== false;
      })
      .map((m: any) => m.module_key as string);

    return {
      profile: {
        tenantId: profile.tenant_id,
        tenantRole: profile.tenant_role,
        isSaasAdmin: Boolean(profile.is_saas_admin),
      },
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status,
        planCode: tenant.plan_code,
        trialStartedAt: tenant.trial_started_at,
        trialEndsAt: tenant.trial_ends_at,
        subscriptionEndsAt: tenant.subscription_ends_at,
      } : null,
      settings: {
        ...parsedSettings,
        trialDays: Number(tenant?.trial_days_override ?? parsedSettings.trialDays),
        trialUserLimit: Number(tenant?.trial_user_limit_override ?? parsedSettings.trialUserLimit),
        paidPrice: Number(tenant?.paid_price_override ?? parsedSettings.paidPrice),
        includedPaidUsers:Number(tenant?.paid_user_limit_override??assignedPlan?.included_users??settings.included_paid_users),extraUserPrice:Number(settings.extra_user_price),includedAssets:Number(assignedPlan?.included_assets??settings.included_assets),purchasedExtraUsers:Number(tenant?.purchased_extra_users??0),extraAssetBlockSize:Number(settings.extra_asset_block_size??2000),extraAssetBlockPrice:Number(settings.extra_asset_block_price??20),purchasedExtraAssets:Number(tenant?.purchased_extra_assets??0),
      },
      enabledModules,
      addOns: modules.filter((m: any) => m.billing_model === "add_on").map((m: any) => ({
        key: m.module_key,
        name: m.label,
        price: Number(m.add_on_price ?? 0),
        currency: parsedSettings.currency,
        available: Boolean(m.globally_enabled),
      })),
      canExportReports: paid,
      canUseCustomDomain: paid,
      paymentConfigured: await isYoCheckoutConfigured(),
    };
  });

/** Historical payment records, scoped strictly to the requesting business. */
export const getTenantPaymentHistory=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const p=await assertTenantAdmin(context.userId);
  const [plans,seats,capacity]=await Promise.all([
   admin.from("billing_transactions").select("id,amount,currency,status,created_at,provider_reference,module_key").eq("tenant_id",p.tenant_id).order("created_at",{ascending:false}).limit(200),
   admin.from("seat_purchase_transactions").select("id,amount,currency,status,created_at,provider_reference").eq("tenant_id",p.tenant_id).order("created_at",{ascending:false}).limit(200),
   admin.from("asset_capacity_purchases").select("id,amount,currency,status,created_at,provider_reference").eq("tenant_id",p.tenant_id).order("created_at",{ascending:false}).limit(200),
  ]);
  for(const result of [plans,seats,capacity])if(result.error)throw Error("Payment history unavailable");
  const rows=[
   ...(plans.data||[]).map((tx:any)=>({...tx,type:tx.module_key?"Add-on · "+tx.module_key:"Subscription"})),
   ...(seats.data||[]).map((tx:any)=>({...tx,type:"Additional user seats"})),
   ...(capacity.data||[]).map((tx:any)=>({...tx,type:"Additional asset capacity"})),
  ];
  return rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,300);
 });

export const updateSaasSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    trial_days: z.number().int().min(1).max(365),
    trial_user_limit: z.number().int().min(1).max(10000),
    paid_price: z.number().min(0),
    currency: z.literal("USD"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const { error } = await admin.from("saas_settings").update({
      ...data,
      currency: data.currency.toUpperCase(),
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    }).eq("id", true);
    if (error) throw new Error(error.message);
    const { error: applyError } = await admin.rpc("apply_current_saas_trial_policy");
    if (applyError) throw new Error(`Settings saved but trial workspaces could not be synchronized: ${applyError.message}`);
    return { ok: true };
  });

export const updateSaasModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    module_key: z.string().min(1).max(100),
    globally_enabled: z.boolean(),
    trial_enabled: z.boolean(),
    paid_enabled: z.boolean(),
    add_on_price: z.number().min(0).max(1000000000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const { error } = await admin.from("saas_modules").update({
      globally_enabled: data.globally_enabled,
      trial_enabled: data.trial_enabled,
      paid_enabled: data.paid_enabled,
      ...(data.add_on_price !== undefined ? { add_on_price: data.add_on_price } : {}),
      updated_at: new Date().toISOString(),
    }).eq("module_key", data.module_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTenantModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tenant_id: z.string().uuid(),
    module_key: z.string().min(1).max(100),
    enabled: z.boolean().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);

    if (data.enabled === null) {
      const { error } = await admin.from("tenant_module_overrides")
        .delete()
        .eq("tenant_id", data.tenant_id)
        .eq("module_key", data.module_key);
      if (error) throw new Error(error.message);
      return { ok: true, inherited: true };
    }

    const { error } = await admin.from("tenant_module_overrides").upsert({
      tenant_id: data.tenant_id,
      module_key: data.module_key,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,module_key" });
    if (error) throw new Error(error.message);
    return { ok: true, inherited: false };
  });

export const assignTenantPricingPlan=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({tenant_id:z.string().uuid(),plan_code:z.enum(["starter","business","enterprise","paid"])}).parse(input))
 .handler(async({context,data})=>{
  await assertSaasAdmin(context.userId);
  const {data:tenant,error:tenantError}=await admin.from("tenants").select("id,subscription_status").eq("id",data.tenant_id).single();
  if(tenantError||!tenant||tenant.subscription_status!=="active")throw Error("Only an active paid workspace can be reassigned");
  const {error}=await admin.from("tenants").update({plan_code:data.plan_code,updated_at:new Date().toISOString()}).eq("id",data.tenant_id);
  if(error)throw Error(error.message);
  return {ok:true};
 });
export const updateTenantSubscription = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({
  tenant_id:z.string().uuid(),
  status:z.enum(["trial","active","expired","suspended"]),
  plan_code:z.enum(["starter","business","enterprise","paid"]).default("paid"),
  period:z.enum(["monthly","six_months","annual","365_days","custom_days"]).optional(),
  duration_days:z.number().int().min(1).max(3650).optional(),
  paid_user_limit:z.number().int().min(-1).max(100000).optional(),
  paid_asset_limit:z.number().int().min(-1).max(100000000).optional(),
  amount_received_ugx:z.number().min(0).max(100000000000).optional(),
  payment_method:z.enum(["cash","bank_transfer","external_mobile_money","admin_grant"]).optional(),
  reason:z.string().trim().min(8).max(500).optional(),
 }).parse(input))
 .handler(async({data,context})=>{
  await assertSaasAdmin(context.userId);
  if(data.status==="active"&&(!data.period||!data.reason||data.paid_user_limit===undefined||data.paid_asset_limit===undefined||!data.payment_method))
   throw Error("Select duration, user/asset limits, payment method, and audit reason before activation");
  if(data.period==="custom_days"&&!data.duration_days)throw Error("Number of days is required");
  const client=await getPostgresPool().connect();
  const eventId=randomUUID();
  const usersToBan:string[]=[];
  try{
   await client.query("BEGIN");
   const current=(await client.query<{subscription_status:string;subscription_ends_at:string|null;plan_code:string}>(
    "SELECT subscription_status,subscription_ends_at,plan_code FROM public.tenants WHERE id=$1 FOR UPDATE",[data.tenant_id])).rows[0];
   if(!current)throw Error("Business not found");
   const now=new Date().toISOString();
   if(data.status==="active"){
    const base=current.subscription_status==="active"&&current.subscription_ends_at&&new Date(current.subscription_ends_at)>new Date()
     ?current.subscription_ends_at:now;
    const months=data.period==="monthly"?1:data.period==="six_months"?6:data.period==="annual"?12:0;
    const days=data.period==="365_days"?365:data.period==="custom_days"?data.duration_days||0:0;
    await client.query(`UPDATE public.tenants SET subscription_status='active',
     subscription_started_at=CASE WHEN subscription_status='active' AND subscription_ends_at>now()
        THEN subscription_started_at ELSE $2::timestamptz END,
     subscription_ends_at=$3::timestamptz+make_interval(months=>$4::integer,days=>$5::integer),
     plan_code=$6,paid_user_limit_override=CASE WHEN $7::integer=-1 THEN NULL ELSE $7::integer END,
     paid_users_unlimited=($7::integer=-1),paid_asset_limit_override=$8,
     last_manual_activation_amount_ugx=$9::numeric,
     last_manual_activation_method=$10,last_manual_activation_at=now(),updated_at=now()
     WHERE id=$1`,
     [data.tenant_id,now,base,months,days,data.plan_code,data.paid_user_limit,data.paid_asset_limit,
      data.amount_received_ugx??null,data.payment_method]);
    if(data.paid_user_limit!==-1){
     const active=(await client.query<{id:string}>(`SELECT p.id FROM public.profiles p
      WHERE p.tenant_id=$1 AND p.is_active=true AND p.is_saas_admin=false
      ORDER BY CASE WHEN p.tenant_role='tenant_admin'
         OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin')
           THEN 0 ELSE 1 END,p.created_at,p.id FOR UPDATE OF p`,[data.tenant_id])).rows;
     const surplus=active.slice(data.paid_user_limit).map(x=>x.id);
     if(surplus.length){
      usersToBan.push(...surplus);
      await client.query("UPDATE public.profiles SET is_active=false WHERE id=ANY($1::uuid[])",[surplus]);
      for(const id of surplus){
       await client.query(`INSERT INTO public.audit_log(entity_type,entity_id,action,actor_user_id,tenant_id,details)
        VALUES('profile',$1,'user_deactivated_subscription_limit',$2,$3,$4::jsonb)`,
        [id,context.userId,data.tenant_id,JSON.stringify({reason:"Subscription active user allowance",limit:data.paid_user_limit,eventId})]);
      }
     }
    }
   }else if(data.status==="trial"){
    const q=(await client.query<{days:number}>(`SELECT COALESCE(t.trial_days_override,s.trial_days)::int days
     FROM public.tenants t CROSS JOIN public.saas_settings s
     WHERE t.id=$1 AND s.id=true`,[data.tenant_id])).rows[0];
    if(!q||!Number.isInteger(q.days)||q.days<1)throw Error("Trial duration is not configured");
    await client.query(`UPDATE public.tenants SET subscription_status='trial',plan_code='trial',
     trial_started_at=now(),trial_ends_at=now()+($2::integer*interval '1 day'),
     subscription_started_at=NULL,subscription_ends_at=NULL,updated_at=now() WHERE id=$1`,[data.tenant_id,q.days]);
   }else{
    await client.query("UPDATE public.tenants SET subscription_status=$2,updated_at=now() WHERE id=$1",[data.tenant_id,data.status]);
   }
   await client.query(`INSERT INTO public.audit_log
    (id,entity_type,entity_id,action,actor_user_id,tenant_id,details)
    VALUES($1,'tenant',$2,'subscription_status_changed',$3,$2,$4::jsonb)`,
    [eventId,data.tenant_id,context.userId,JSON.stringify({
     previousStatus:current.subscription_status,newStatus:data.status,previousPlan:current.plan_code,
     plan:data.plan_code,period:data.period||null,durationDays:data.duration_days||null,
     userLimit:data.paid_user_limit??null,assetLimit:data.paid_asset_limit??null,
     amountReceivedUgx:data.amount_received_ugx??null,paymentMethod:data.payment_method||null,
     reason:data.reason||null,deactivatedUsers:usersToBan.length
    })]);
   await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error}
  finally{client.release()}
  for(const userId of usersToBan){
   try{
    const {error}=await supabaseAdmin.auth.admin.updateUserById(userId,{ban_duration:"876000h"});
    if(error)console.error("[Subscription] User ban sync failed",userId,error.message);
   }catch(error){console.error("[Subscription] User ban sync retry needed",userId,String(error).slice(0,180))}
  }
  if(data.status==="active"){
   try{await queueTenantActivationNotice(data.tenant_id,{type:"admin",eventId})}
   catch(error){console.error("[Subscription] Activation saved; email queue failed",error)}
  }
  return {ok:true,deactivatedUsers:usersToBan.length};
 });

export const updateTenantControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({
    tenant_id: z.string().uuid(),
    trial_days_override: z.number().int().min(1).max(3650).nullable(),
    trial_user_limit_override: z.number().int().min(1).max(100000).nullable(),
    paid_price_override: z.number().finite().min(0).max(100000000000).nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const { data: before, error: lookupError } = await admin.from("tenants")
      .select("id,subscription_status,trial_started_at,trial_ends_at,created_at")
      .eq("id", data.tenant_id).single();
    if (lookupError || !before) throw new Error(lookupError?.message || "Business not found");
    const { data: globalPolicy, error: policyError } = await admin.from("saas_settings")
      .select("trial_days").eq("id", true).single();
    if (policyError || !globalPolicy) throw new Error("Global trial policy unavailable");
    const days = data.trial_days_override ?? Number(globalPolicy.trial_days);
    const patch: Record<string, unknown> = {
      trial_days_override: data.trial_days_override,
      trial_user_limit_override: data.trial_user_limit_override,
      paid_price_override: data.paid_price_override,
      updated_at: new Date().toISOString(),
    };
    // Keep the original trial start; changing the duration is not a trial restart.
    if (before.subscription_status === "trial") {
      const started = before.trial_started_at ?? before.created_at;
      if (!started) throw new Error("Trial start date is missing");
      patch.trial_ends_at = new Date(new Date(started).getTime() + days * 86400000).toISOString();
    }
    const { error } = await admin.from("tenants").update(patch).eq("id",data.tenant_id);
    if (error) throw new Error(error.message);
    return {ok:true};
  });

export const listSaasTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSaasAdmin(context.userId);
    const { data, error } = await admin.from("tenants")
      .select("id,name,slug,subscription_status,plan_code,trial_ends_at,subscription_ends_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSaasAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSaasAdmin(context.userId);

    const [
      tenantsResult,
      profilesResult,
      assetsResult,
      branchesResult,
      transactionsResult,
      domainsResult,
      auditResult,
      settingsResult,
    ] = await Promise.all([
      admin.from("tenants").select("id,name,slug,subscription_status,plan_code,trial_ends_at,subscription_ends_at,created_at,updated_at").order("created_at", { ascending: false }),
      admin.from("profiles").select("id,tenant_id,is_active,is_saas_admin,created_at"),
      admin.from("assets").select("id,tenant_id,status,purchase_value,created_at"),
      admin.from("branches").select("id,tenant_id,is_active"),
      admin.from("billing_transactions").select("tenant_id,amount,currency,status,created_at"),
      admin.from("custom_domains").select("tenant_id,status,hostname"),
      admin.from("audit_log").select("tenant_id,created_at").order("created_at", { ascending: false }).limit(5000),
      admin.from("saas_settings").select("trial_days,trial_user_limit,paid_price,currency,backup_enabled,backup_interval_hours").eq("id", true).single(),
    ]);

    // Tenant enumeration is essential; secondary analytics must never hide businesses.
    if (tenantsResult.error) throw new Error(tenantsResult.error.message);
    for (const [name, result] of [
      ["profiles", profilesResult], ["assets", assetsResult],
      ["branches", branchesResult], ["billing", transactionsResult],
      ["domains", domainsResult], ["audit", auditResult],
      ["settings", settingsResult],
    ] as const) {
      if (result.error) console.error("SaaS dashboard optional query failed:", name, result.error.message);
    }

    const tenants = tenantsResult.data ?? [];
    const profiles = profilesResult.data ?? [];
    const assets = assetsResult.data ?? [];
    const branches = branchesResult.data ?? [];
    const transactions = transactionsResult.data ?? [];
    const domains = domainsResult.data ?? [];
    const audit = auditResult.data ?? [];

    const usersByTenant = new Map<string, number>();
    const assetsByTenant = new Map<string, { count: number; value: number; recent: number }>();
    const branchesByTenant = new Map<string, number>();
    const revenueByTenant = new Map<string, number>();
    const domainsByTenant = new Map<string, { total: number; active: number }>();
    const lastActivityByTenant = new Map<string, string>();
    const cutoff30 = Date.now() - 30 * 86400000;

    for (const p of profiles) {
      if (!p.tenant_id || p.is_saas_admin || p.is_active === false) continue;
      usersByTenant.set(p.tenant_id, (usersByTenant.get(p.tenant_id) ?? 0) + 1);
    }
    for (const a of assets) {
      if (!a.tenant_id) continue;
      const current = assetsByTenant.get(a.tenant_id) ?? { count: 0, value: 0, recent: 0 };
      current.count += 1;
      current.value += Number(a.purchase_value) || 0;
      if (a.created_at && new Date(a.created_at).getTime() >= cutoff30) current.recent += 1;
      assetsByTenant.set(a.tenant_id, current);
    }
    for (const b of branches) {
      if (!b.tenant_id || b.is_active === false) continue;
      branchesByTenant.set(b.tenant_id, (branchesByTenant.get(b.tenant_id) ?? 0) + 1);
    }
    for (const tx of transactions) {
      if (!tx.tenant_id || tx.status !== "successful") continue;
      revenueByTenant.set(tx.tenant_id, (revenueByTenant.get(tx.tenant_id) ?? 0) + (Number(tx.amount) || 0));
    }
    for (const d of domains) {
      if (!d.tenant_id) continue;
      const current = domainsByTenant.get(d.tenant_id) ?? { total: 0, active: 0 };
      current.total += 1;
      if (d.status === "active" || d.status === "verified") current.active += 1;
      domainsByTenant.set(d.tenant_id, current);
    }
    for (const row of audit) {
      if (!row.tenant_id || lastActivityByTenant.has(row.tenant_id)) continue;
      lastActivityByTenant.set(row.tenant_id, row.created_at);
    }

    const tenantStats = tenants.map((tenant: any) => {
      const status = computeStatus(tenant);
      const assetStats = assetsByTenant.get(tenant.id) ?? { count: 0, value: 0, recent: 0 };
      const domainStats = domainsByTenant.get(tenant.id) ?? { total: 0, active: 0 };
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status,
        rawStatus: tenant.subscription_status,
        planCode: tenant.plan_code,
        trialEndsAt: tenant.trial_ends_at,
        subscriptionEndsAt: tenant.subscription_ends_at,
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at,
        users: usersByTenant.get(tenant.id) ?? 0,
        assets: assetStats.count,
        assetValue: assetStats.value,
        assetsAdded30d: assetStats.recent,
        branches: branchesByTenant.get(tenant.id) ?? 0,
        revenue: revenueByTenant.get(tenant.id) ?? 0,
        domains: domainStats.total,
        activeDomains: domainStats.active,
        lastActivityAt: lastActivityByTenant.get(tenant.id) ?? null,
      };
    });

    const effectiveStatusCount = (status: string) => tenantStats.filter((t: any) => t.status === status).length;
    const newWorkspaces30d = tenantStats.filter((t: any) => new Date(t.createdAt).getTime() >= cutoff30).length;

    return {
      summary: {
        organizations: tenantStats.length,
        active: effectiveStatusCount("active"),
        trials: effectiveStatusCount("trial"),
        expired: effectiveStatusCount("expired"),
        suspended: effectiveStatusCount("suspended"),
        users: tenantStats.reduce((sum: number, t: any) => sum + t.users, 0),
        assets: tenantStats.reduce((sum: number, t: any) => sum + t.assets, 0),
        assetValue: tenantStats.reduce((sum: number, t: any) => sum + t.assetValue, 0),
        newWorkspaces30d,
        assetsAdded30d: tenantStats.reduce((sum: number, t: any) => sum + t.assetsAdded30d, 0),
        successfulRevenue: tenantStats.reduce((sum: number, t: any) => sum + t.revenue, 0),
      },
      tenants: tenantStats,
      policy: {
        trialDays: Number(settingsResult.data?.trial_days ?? 14),
        trialUserLimit: Number(settingsResult.data?.trial_user_limit ?? 5),
        paidPrice: Number(settingsResult.data?.paid_price ?? 0),
        currency: String(settingsResult.data?.currency || "").toUpperCase(),
      },
      technical: {
        database: "operational",
        authProxyConfigured: Boolean(process.env.SUPABASE_AUTH_INTERNAL_URL),
        restProxyConfigured: Boolean(process.env.SUPABASE_REST_INTERNAL_URL),
        paymentConfigured: await isYoCheckoutConfigured(),
        databaseBackupConfigured: Boolean(process.env.DATABASE_URL),
        r2Configured: Boolean(
          process.env.R2_ACCOUNT_ID &&
          process.env.R2_ACCESS_KEY_ID &&
          process.env.R2_SECRET_ACCESS_KEY &&
          process.env.R2_BUCKET
        ),
        backupEnabled: Boolean(settingsResult.data?.backup_enabled),
        backupIntervalHours: Number(settingsResult.data?.backup_interval_hours || 24),
      },
    };
  });

export const getSaasTenantDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tenant_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);

    const [
      tenantResult,
      profilesResult,
      assetsResult,
      branchesResult,
      domainsResult,
      billingResult,
      modulesResult,
      overridesResult,
      auditResult,
      brandingResult,
    ] = await Promise.all([
      admin.from("tenants").select("*").eq("id", data.tenant_id).single(),
      admin.from("profiles").select("id,email,full_name,is_active,tenant_role,is_saas_admin,created_at").eq("tenant_id", data.tenant_id).order("created_at"),
      admin.from("assets").select("id,status,purchase_value,created_at").eq("tenant_id", data.tenant_id),
      admin.from("branches").select("id,name,code,is_active").eq("tenant_id", data.tenant_id).order("name"),
      admin.from("custom_domains").select("id,hostname,status,verified_at,created_at").eq("tenant_id", data.tenant_id).order("created_at", { ascending: false }),
      admin.from("billing_transactions").select("id,provider_reference,amount,currency,status,created_at").eq("tenant_id", data.tenant_id).order("created_at", { ascending: false }).limit(20),
      admin.from("saas_modules").select("*").order("sort_order"),
      admin.from("tenant_module_overrides").select("module_key,enabled").eq("tenant_id", data.tenant_id),
      admin.from("audit_log").select("id,action,entity_type,created_at,actor_user_id").eq("tenant_id", data.tenant_id).order("created_at", { ascending: false }).limit(20),
      admin.from("document_templates").select("organization_name,logo_data_url,updated_at").eq("tenant_id", data.tenant_id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    for (const result of [
      tenantResult, profilesResult, assetsResult, branchesResult, domainsResult,
      billingResult, modulesResult, overridesResult, auditResult, brandingResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const profiles = profilesResult.data ?? [];
    const userIds = profiles.map((p: any) => p.id);
    const rolesResult = userIds.length
      ? await admin.from("user_roles").select("user_id,role").in("user_id", userIds)
      : { data: [], error: null };
    if (rolesResult.error) throw new Error(rolesResult.error.message);

    const roleMap = new Map<string, string[]>();
    for (const row of rolesResult.data ?? []) {
      const roles = roleMap.get(row.user_id) ?? [];
      roles.push(row.role);
      roleMap.set(row.user_id, roles);
    }

    const tenant = tenantResult.data;
    const status = computeStatus(tenant);
    const paid = status === "active";
    const overrides = new Map((overridesResult.data ?? []).map((row: any) => [row.module_key, row.enabled]));
    const modules = (modulesResult.data ?? []).map((module: any) => {
      const override = overrides.has(module.module_key) ? overrides.get(module.module_key) : null;
      const effectiveEnabled = module.billing_model === "add_on"
        ? Boolean(module.globally_enabled && override === true)
        : Boolean(module.globally_enabled && (paid ? module.paid_enabled : module.trial_enabled) && override !== false);
      return {
        ...module,
        override,
        effectiveEnabled,
      };
    });

    const assets = assetsResult.data ?? [];
    const assetStatus: Record<string, number> = {};
    for (const asset of assets) {
      assetStatus[asset.status] = (assetStatus[asset.status] ?? 0) + 1;
    }

    return {
      tenant: {
        ...tenant,
        effective_status: status,
      },
      metrics: {
        users: profiles.filter((p: any) => !p.is_saas_admin && p.is_active !== false).length,
        assets: assets.length,
        assetValue: assets.reduce((sum: number, a: any) => sum + (Number(a.purchase_value) || 0), 0),
        branches: (branchesResult.data ?? []).filter((b: any) => b.is_active !== false).length,
        assetStatus,
      },
      users: profiles
        .filter((p: any) => !p.is_saas_admin)
        .map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] })),
      branches: branchesResult.data ?? [],
      domains: domainsResult.data ?? [],
      billing: billingResult.data ?? [],
      modules,
      recentActivity: auditResult.data ?? [],
      branding: brandingResult.data ?? null,
    };
  });

export const updateSaasTenantName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tenant_id: z.string().uuid(),
    name: z.string().trim().min(2).max(160),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const { error } = await admin.from("tenants").update({
      name: data.name,
      updated_at: new Date().toISOString(),
    }).eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSaasTenantUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
    is_active: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);

    const { data: target, error: targetError } = await admin.from("profiles")
      .select("id,tenant_id,is_saas_admin")
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id)
      .single();
    if (targetError || !target) throw new Error("Business user not found");
    if (target.is_saas_admin) throw new Error("A SaaS administrator cannot be changed from a business account");

    const { error } = await admin.from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSaasModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSaasAdmin(context.userId);
    const { data, error } = await admin.from("saas_modules").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCustomDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await assertTenantAdmin(context.userId);
    const { data, error } = await admin.from("custom_domains").select("*").eq("tenant_id", p.tenant_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    hostname: z.string().min(3).max(253).transform((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const { data: tenant } = await admin.from("tenants").select("subscription_status").eq("id", p.tenant_id).single();
    if (tenant?.subscription_status !== "active") throw new Error("Custom domains are available on the paid plan. Upgrade first.");
    if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(data.hostname)) {
      throw new Error("Enter a valid domain or subdomain");
    }
    const token = `assetflow-${crypto.randomUUID()}`;
    const { data: created, error } = await admin.from("custom_domains").insert({
      tenant_id: p.tenant_id,
      hostname: data.hostname,
      verification_token: token,
      status: "pending",
    }).select().single();
    if (error) throw new Error(error.message);
    return created;
  });

export const verifyCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ domain_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const { data: row, error } = await admin.from("custom_domains").select("*")
      .eq("id", data.domain_id).eq("tenant_id", p.tenant_id).single();
    if (error || !row) throw new Error("Domain not found");
    try {
      const records = await resolveTxt(`_assetflow.${row.hostname}`);
      const values = records.map((parts) => parts.join(""));
      if (!values.includes(row.verification_token)) throw new Error("Verification TXT record not found yet");
      await admin.from("custom_domains").update({
        status: "verified",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      return { ok: true };
    } catch (e: any) {
      throw new Error(e?.message === "Verification TXT record not found yet" ? e.message : "Verification TXT record not found yet");
    }
  });

function xmlEscape(v: string | number) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}
function xmlTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1]?.trim() ?? "";
}
async function yoRequest(body: string, mode: "sandbox" | "production") {
  // Fixed provider endpoints prevent user-controlled payment destinations.
  const endpoint = mode === "sandbox"
    ? "https://sandbox.yo.co.ug/services/yopaymentsdev/task.php"
    : "https://paymentsapi1.yo.co.ug/ybs/task.php";
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Payment gateway returned HTTP ${r.status}`);
  return text;
}

export const startYoUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({phone:ugandanMobileMoneyPhoneSchema,plan_id:z.enum(["starter","business","enterprise"]),period:z.enum(["monthly","annual"])}).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const {username,password,mode}=await getYoCheckoutConfig();
    if (!username || !password) throw new Error("Payment gateway is not configured on this deployment yet");

    const { data: settings, error: settingsError } = await admin.from("saas_settings")
      .select("paid_price,currency").eq("id", true).single();
    if (settingsError || !settings) throw new Error(settingsError?.message || "Global SaaS pricing is not configured");
    const {data:plan,error:planError}=await admin.from("saas_pricing_plans").select("id,monthly_price,annual_price,is_published").eq("id",data.plan_id).single();
    if(planError||!plan||!plan.is_published)throw Error("Selected subscription package is unavailable");
    const baseAmountUsd=Number(data.period==="annual"?plan.annual_price:plan.monthly_price);
    if(String(settings.currency).toUpperCase()!=="USD")throw Error("SaaS prices must be configured in USD");
    if(!Number.isFinite(baseAmountUsd)||baseAmountUsd<=0)throw Error("Selected package requires a positive price");
    const quote=await currentUsdUgxQuote(true);
    if(!quote)throw Error("Verified exchange rate unavailable");
    const amount=usdToUgx(baseAmountUsd,quote.rate);
    const currency="UGX";

    const phone = data.phone;
    

    const { data: tx, error: txError } = await admin.from("billing_transactions").insert({
      tenant_id: p.tenant_id,
      phone,
      amount,
      currency,
      base_amount_usd:baseAmountUsd,
      conversion_rate:quote.rate,
      conversion_source:quote.source,
      conversion_timestamp:quote.updatedAt,
      status: "pending",
      plan_code:data.plan_id,billing_period:data.period,
    }).select().single();
    if (txError) throw new Error(txError.message);

    const xml = `<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>` +
      `<APIUsername>${xmlEscape(username)}</APIUsername>` +
      `<APIPassword>${xmlEscape(password)}</APIPassword>` +
      `<Method>acdepositfunds</Method><NonBlocking>TRUE</NonBlocking>` +
      `<Account>${xmlEscape(phone)}</Account><Amount>${xmlEscape(amount)}</Amount>` +
      `<Narrative>${xmlEscape("AssetFlow "+data.plan_id+" "+data.period+" subscription")}</Narrative>` +
      `<ExternalReference>${xmlEscape(tx.id)}</ExternalReference>` +
      `</Request></AutoCreate>`;

    try {
      const raw = await yoRequest(xml,mode);
      const response = {
        Status: xmlTag(raw, "Status"),
        StatusCode: xmlTag(raw, "StatusCode"),
        StatusMessage: xmlTag(raw, "StatusMessage"),
        TransactionStatus: xmlTag(raw, "TransactionStatus"),
        TransactionReference: xmlTag(raw, "TransactionReference"),
        ErrorMessage: xmlTag(raw, "ErrorMessage"),
      };
      await admin.from("billing_transactions").update({
        provider_reference: response.TransactionReference || null,
        raw_response: response,
        updated_at: new Date().toISOString(),
      }).eq("id", tx.id);
      if (response.Status !== "OK") {
        await admin.from("billing_transactions").update({ status: "failed" }).eq("id", tx.id);
        throw new Error(response.ErrorMessage || response.StatusMessage || "Payment gateway rejected the request");
      }
      return { transactionId: tx.id, providerReference: response.TransactionReference, status: response.TransactionStatus || "PENDING" };
    } catch (e) {
      await admin.from("billing_transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
      throw e;
    }
  });

export const startYoAddonPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    module_key: z.string().min(1).max(100),
    phone: ugandanMobileMoneyPhoneSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const {username,password,mode}=await getYoCheckoutConfig();
    if (!username || !password) throw new Error("Payment gateway is not configured");

    const { data: module, error: moduleError } = await admin.from("saas_modules")
      .select("module_key,label,globally_enabled,billing_model,add_on_price")
      .eq("module_key", data.module_key).single();
    if (moduleError || !module || module.billing_model !== "add_on" || !module.globally_enabled) {
      throw new Error("Add-on is not available");
    }
    const baseAmountUsd = Number(module.add_on_price);
    if (!Number.isFinite(baseAmountUsd) || baseAmountUsd <= 0) throw new Error("Add-on price is not set");
    const { data: settings, error: settingsError } = await admin.from("saas_settings")
      .select("currency").eq("id", true).single();
    if (settingsError || !settings?.currency) throw new Error("Billing currency is not configured");
    if(String(settings.currency).toUpperCase()!=="USD")throw Error("SaaS prices must be configured in USD");
    const quote=await currentUsdUgxQuote(true);
    if(!quote)throw Error("Verified exchange rate unavailable");
    const amount=usdToUgx(baseAmountUsd,quote.rate);
    const currency="UGX";

    const existing = await admin.from("tenant_module_overrides")
      .select("enabled").eq("tenant_id", p.tenant_id).eq("module_key", data.module_key).maybeSingle();
    if (existing.data?.enabled === true) throw new Error("This add-on is already active");

    const phone = data.phone;
    

    const { data: tx, error: txError } = await admin.from("billing_transactions").insert({
      tenant_id: p.tenant_id,
      module_key: data.module_key,
      phone,
      amount,
      currency,
      base_amount_usd:baseAmountUsd,
      conversion_rate:quote.rate,
      conversion_source:quote.source,
      conversion_timestamp:quote.updatedAt,
      status: "pending",
    }).select().single();
    if (txError) throw new Error(txError.message);

    const xml = '<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>' +
      '<APIUsername>' + xmlEscape(username) + '</APIUsername><APIPassword>' + xmlEscape(password) + '</APIPassword>' +
      '<Method>acdepositfunds</Method><NonBlocking>TRUE</NonBlocking>' +
      '<Account>' + xmlEscape(phone) + '</Account><Amount>' + xmlEscape(amount) + '</Amount>' +
      '<Narrative>' + xmlEscape("AssetFlow " + module.label + " add-on") + '</Narrative>' +
      '<ExternalReference>' + xmlEscape(tx.id) + '</ExternalReference></Request></AutoCreate>';

    try {
      const raw = await yoRequest(xml,mode);
      const response = {
        Status: xmlTag(raw, "Status"),
        StatusCode: xmlTag(raw, "StatusCode"),
        StatusMessage: xmlTag(raw, "StatusMessage"),
        TransactionStatus: xmlTag(raw, "TransactionStatus"),
        TransactionReference: xmlTag(raw, "TransactionReference"),
        ErrorMessage: xmlTag(raw, "ErrorMessage"),
      };
      await admin.from("billing_transactions").update({
        provider_reference: response.TransactionReference || null,
        raw_response: response,
        updated_at: new Date().toISOString(),
      }).eq("id", tx.id);
      if (response.Status !== "OK") {
        await admin.from("billing_transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
        throw new Error(response.ErrorMessage || response.StatusMessage || "Payment request failed");
      }
      return { transactionId: tx.id, moduleKey: data.module_key, providerReference: response.TransactionReference, status: response.TransactionStatus || "PENDING" };
    } catch (e) {
      await admin.from("billing_transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
      throw e;
    }
  });

export const checkYoAddonPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ transaction_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const {username,password,mode}=await getYoCheckoutConfig();
    if (!username || !password) throw new Error("Payment gateway is not configured");

    const { data: tx, error } = await admin.from("billing_transactions").select("*")
      .eq("id", data.transaction_id).eq("tenant_id", p.tenant_id).single();
    if (error || !tx || !tx.module_key) throw new Error("Add-on payment not found");
    if (!tx.provider_reference) throw new Error("Payment reference is not available");

    const xml = '<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>' +
      '<APIUsername>' + xmlEscape(username) + '</APIUsername><APIPassword>' + xmlEscape(password) + '</APIPassword>' +
      '<Method>actransactioncheckstatus</Method><TransactionReference>' + xmlEscape(tx.provider_reference) + '</TransactionReference>' +
      '<PrivateTransactionReference>' + xmlEscape(tx.id) + '</PrivateTransactionReference>' +
      '<DepositTransactionType>PULL</DepositTransactionType></Request></AutoCreate>';
    const raw = await yoRequest(xml,mode);
    const transactionStatus = xmlTag(raw, "TransactionStatus").toUpperCase();
    const successful = transactionStatus === "SUCCEEDED";
    const failed = transactionStatus === "FAILED";
    const response = {
      Status: xmlTag(raw, "Status"),
      StatusCode: xmlTag(raw, "StatusCode"),
      StatusMessage: xmlTag(raw, "StatusMessage"),
      TransactionStatus: transactionStatus,
      TransactionReference: xmlTag(raw, "TransactionReference"),
      Amount: xmlTag(raw, "Amount"),
      CurrencyCode: xmlTag(raw, "CurrencyCode"),
      ErrorMessage: xmlTag(raw, "ErrorMessage"),
    };

    await admin.from("billing_transactions").update({
      status: successful ? "successful" : failed ? "failed" : "pending",
      raw_response: response,
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    if (successful) {
      const { error: activateError } = await admin.from("tenant_module_overrides").upsert({
        tenant_id: p.tenant_id,
        module_key: tx.module_key,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,module_key" });
      if (activateError) throw new Error(activateError.message);
    }

    return { status: transactionStatus || "PENDING", successful, moduleKey: tx.module_key, response };
  });

export const checkYoUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ transaction_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const {username,password,mode}=await getYoCheckoutConfig();
    if (!username || !password) throw new Error("Payment gateway is not configured on this deployment yet");
    const { data: tx, error } = await admin.from("billing_transactions").select("*")
      .eq("id", data.transaction_id).eq("tenant_id", p.tenant_id).single();
    if (error || !tx) throw new Error("Payment transaction not found");
    if (!tx.provider_reference) throw new Error("Payment transaction reference is not available");

    const xml = `<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>` +
      `<APIUsername>${xmlEscape(username)}</APIUsername><APIPassword>${xmlEscape(password)}</APIPassword>` +
      `<Method>actransactioncheckstatus</Method>` +
      `<TransactionReference>${xmlEscape(tx.provider_reference)}</TransactionReference>` +
      `<PrivateTransactionReference>${xmlEscape(tx.id)}</PrivateTransactionReference>` +
      `<DepositTransactionType>PULL</DepositTransactionType></Request></AutoCreate>`;
    const raw = await yoRequest(xml,mode);
    const transactionStatus = xmlTag(raw, "TransactionStatus").toUpperCase();
    const response = {
      Status: xmlTag(raw, "Status"),
      StatusCode: xmlTag(raw, "StatusCode"),
      StatusMessage: xmlTag(raw, "StatusMessage"),
      TransactionStatus: transactionStatus,
      TransactionReference: xmlTag(raw, "TransactionReference"),
      Amount: xmlTag(raw, "Amount"),
      CurrencyCode: xmlTag(raw, "CurrencyCode"),
      ErrorMessage: xmlTag(raw, "ErrorMessage"),
    };
    const successful = transactionStatus === "SUCCEEDED";
    const failed = transactionStatus === "FAILED";
    if(successful){
      const {error:activationError}=await admin.rpc("activate_paid_plan_transaction",{p_id:tx.id,p_tenant:p.tenant_id});
      if(activationError)throw Error(activationError.message);
      try{await queueTenantActivationNotice(p.tenant_id,{type:"payment",transactionId:tx.id})}
      catch(noticeError){console.error("[Billing] Payment activated; activation notice failed",noticeError)}
    }else{
      const {error:updateError}=await admin.from("billing_transactions").update({
        status:failed?"failed":"pending",raw_response:response,updated_at:new Date().toISOString()
      }).eq("id",tx.id);
      if(updateError)throw Error(updateError.message);
    }
    return { status: transactionStatus || "PENDING", successful, response };
  });

export const getSaasTenantTagSettings=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({tenant_id:z.string().uuid()}).parse(input))
 .handler(async ({data,context})=>{
   await assertSaasAdmin(context.userId);
   const {data:tenant,error:tenantError}=await admin.from("tenants").select("id").eq("id",data.tenant_id).maybeSingle();
   if(tenantError||!tenant)throw new Error("Business not found");
   const {data:settings,error}=await admin.from("tenant_asset_tag_settings").select("prefix,separator,padding,next_number").eq("tenant_id",data.tenant_id).maybeSingle();
   if(error)throw new Error(error.message);
   return settings??{prefix:"AST",separator:"-",padding:5,next_number:1};
 });
export const updateSaasTenantTagSettings=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({tenant_id:z.string().uuid(),prefix:z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/),separator:z.enum(["","-","/"]),padding:z.number().int().min(2).max(12)}).parse(input))
 .handler(async ({data,context})=>{
   await assertSaasAdmin(context.userId);
   const {data:tenant,error:tenantError}=await admin.from("tenants").select("id").eq("id",data.tenant_id).maybeSingle();
   if(tenantError||!tenant)throw new Error("Business not found");
   const {error}=await admin.from("tenant_asset_tag_settings").upsert({...data,updated_at:new Date().toISOString()},{onConflict:"tenant_id"});
   if(error)throw new Error(error.message);
   return {ok:true};
 });

export const getPublicPricing=createServerFn({method:"GET"}).handler(async()=>{
 const {data:settings,error}=await admin.from("saas_settings").select("paid_price,currency,included_paid_users,extra_user_price,included_assets,trial_days").eq("id",true).single();
 if(error||!settings)throw new Error("Pricing unavailable");
 const {data:modules,error:modulesError}=await admin.from("saas_modules").select("module_key,label,add_on_price").eq("billing_model","add_on").eq("globally_enabled",true);
 if(modulesError)throw new Error(modulesError.message);
 return {price:Number(settings.paid_price),currency:settings.currency,users:Number(settings.included_paid_users),extraUserPrice:Number(settings.extra_user_price),assets:Number(settings.included_assets),trialDays:Number(settings.trial_days),addOns:(modules??[]).map((m:any)=>({label:m.label,price:Number(m.add_on_price)}))};
});

export const startYoSeatPurchase=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({phone:ugandanMobileMoneyPhoneSchema,quantity:z.number().int().min(1).max(100)}).parse(input))
 .handler(async ({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
  const {username,password,mode}=await getYoCheckoutConfig();
  if(!username||!password)throw Error("Payment gateway is not configured");
  const {data:tenant,error:te}=await admin.from("tenants").select("subscription_status,subscription_ends_at").eq("id",p.tenant_id).single();
  if(te||tenant?.subscription_status!=="active"||(tenant.subscription_ends_at&&new Date(tenant.subscription_ends_at)<=new Date()))throw Error("Activate or renew your paid subscription before adding seats.");
  const {data:settings,error:se}=await admin.from("saas_settings").select("currency,extra_user_price").eq("id",true).single();
  if(se||!settings)throw Error("Seat pricing not configured");
  if(String(settings.currency).toUpperCase()!=="USD")throw Error("SaaS prices must be configured in USD");
  const baseUnitPriceUsd=Number(settings.extra_user_price);
  const baseAmountUsd=baseUnitPriceUsd*data.quantity;
  if(!Number.isFinite(baseAmountUsd)||baseAmountUsd<=0)throw Error("SaaS Admin must configure a positive extra-user price");
  const quote=await currentUsdUgxQuote(true);
  if(!quote)throw Error("Verified exchange rate unavailable");
  const unitPrice=usdToUgx(baseUnitPriceUsd,quote.rate);
  const amount=usdToUgx(baseAmountUsd,quote.rate);
  const phone=data.phone;
  
  const {data:tx,error}=await admin.from("seat_purchase_transactions").insert({tenant_id:p.tenant_id,user_id:context.userId,quantity:data.quantity,unit_price:unitPrice,amount,currency:"UGX",base_amount_usd:baseAmountUsd,conversion_rate:quote.rate,conversion_timestamp:quote.updatedAt,phone}).select("id").single();
  if(error||!tx)throw Error(error?.message||"Could not create purchase");
  const xml='<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>'+
   '<APIUsername>'+xmlEscape(username)+'</APIUsername><APIPassword>'+xmlEscape(password)+'</APIPassword>'+
   '<Method>acdepositfunds</Method><NonBlocking>TRUE</NonBlocking><Account>'+xmlEscape(phone)+'</Account><Amount>'+xmlEscape(amount)+'</Amount>'+
   '<Narrative>'+xmlEscape("AssetFlow "+data.quantity+" extra user seats")+'</Narrative><ExternalReference>'+xmlEscape(tx.id)+'</ExternalReference></Request></AutoCreate>';
  try{
    const raw=await yoRequest(xml,mode),reference=xmlTag(raw,"TransactionReference"),status=xmlTag(raw,"Status");
    await admin.from("seat_purchase_transactions").update({provider_reference:reference||null,status:status==="OK"?"pending":"failed"}).eq("id",tx.id);
    if(status!=="OK")throw Error(xmlTag(raw,"ErrorMessage")||xmlTag(raw,"StatusMessage")||"Payment was rejected");
    return {transactionId:tx.id,status:xmlTag(raw,"TransactionStatus")||"PENDING"};
  }catch(e){await admin.from("seat_purchase_transactions").update({status:"failed"}).eq("id",tx.id);throw e}
 });

export const checkYoSeatPurchase=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({transactionId:z.string().uuid()}).parse(input))
 .handler(async ({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
    const {username,password,mode}=await getYoCheckoutConfig();
  if(!username||!password)throw Error("Payment gateway unavailable");
  const {data:tx,error}=await admin.from("seat_purchase_transactions").select("*").eq("id",data.transactionId).eq("tenant_id",p.tenant_id).single();
  if(error||!tx)throw Error("Seat purchase not found");
  if(tx.status==="successful")return {successful:true,status:"SUCCEEDED"};
  if(tx.status!=="pending"||!tx.provider_reference)throw Error("Payment is not pending");
  const xml='<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request><APIUsername>'+xmlEscape(username)+'</APIUsername><APIPassword>'+xmlEscape(password)+'</APIPassword><Method>actransactioncheckstatus</Method><TransactionReference>'+xmlEscape(tx.provider_reference)+'</TransactionReference><PrivateTransactionReference>'+xmlEscape(tx.id)+'</PrivateTransactionReference><DepositTransactionType>PULL</DepositTransactionType></Request></AutoCreate>';
  const raw=await yoRequest(xml,mode),status=xmlTag(raw,"TransactionStatus").toUpperCase();
  if(status==="SUCCEEDED"){
   const {error:activationError}=await admin.rpc("activate_seat_purchase",{p_id:tx.id,p_tenant:p.tenant_id});
   if(activationError)throw Error(activationError.message);
  }else if(status==="FAILED")await admin.from("seat_purchase_transactions").update({status:"failed"}).eq("id",tx.id);
  return {successful:status==="SUCCEEDED",status};
 });

export const getPricingPlans=createServerFn({method:"GET"}).handler(async()=>{
 const {data,error}=await admin.from("saas_pricing_plans").select("id,name,description,monthly_price,annual_price,included_users,included_assets,features,enabled_modules,is_published").eq("is_published",true).order("monthly_price");
 if(error)throw Error(error.message);
 const {data:settings}=await admin.from("saas_settings").select("currency,extra_user_price,extra_asset_block_size,extra_asset_block_price,trial_days").eq("id",true).single();
 const {data:modules}=await admin.from("saas_modules").select("module_key,label").eq("globally_enabled",true);const moduleNames=new Map((Array.isArray(modules)?modules:[]).map((m:any)=>[m.module_key,m.label]));
 const fx=await currentUsdUgxQuote();
 return {currency:"USD",fxRate:fx?.rate??null,fxUpdatedAt:fx?.updatedAt??null,fxSource:fx?.source??null,extraUserPrice:Number(settings?.extra_user_price??0),extraAssetBlockSize:Number(settings?.extra_asset_block_size??2000),extraAssetBlockPrice:Number(settings?.extra_asset_block_price??20),trialDays:Number(settings?.trial_days??14),plans:(data??[]).map((p:any)=>({...p,monthly_price:Number(p.monthly_price),annual_price:Number(p.annual_price),module_labels:(Array.isArray(p.enabled_modules)?p.enabled_modules:[]).map((k:string)=>moduleNames.get(k)||k)}))};
});
export const getAdminAvailableModules=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 await assertSaasAdmin(context.userId);
 const {data,error}=await admin.from("saas_modules").select("module_key,label,billing_model").eq("globally_enabled",true).order("sort_order");
 if(error)throw Error(error.message);
 return (data??[]).filter((m:any)=>m.billing_model!=="add_on");
});
export const getAdminPricingPlans=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 await assertSaasAdmin(context.userId);
 const {data,error}=await admin.from("saas_pricing_plans").select("*").order("monthly_price");
 if(error)throw Error(error.message);
 return data??[];
});
export const saveAdminPricingPlan=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({id:z.enum(["starter","business","enterprise"]),name:z.string().min(2).max(60),description:z.string().max(300),monthly_price:z.number().finite().min(0),annual_price:z.number().finite().min(0),included_users:z.number().int().min(1),included_assets:z.number().int().min(1),features:z.array(z.string().min(1).max(100)).max(30),enabled_modules:z.array(z.string().min(1).max(70)).max(40),is_published:z.boolean()}).parse(input))
 .handler(async({context,data})=>{
  await assertSaasAdmin(context.userId);
  const {data:saved,error}=await admin.from("saas_pricing_plans").upsert({...data,updated_at:new Date().toISOString()},{onConflict:"id"}).select("id").single();
  if(error||!saved)throw Error(error?.message||"The plan could not be saved");
  return {saved:true,id:saved.id};
 });
export const startYoAssetCapacityPurchase=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({phone:ugandanMobileMoneyPhoneSchema,quantity:z.number().int().min(1).max(100)}).parse(input))
 .handler(async ({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
  const {username,password,mode}=await getYoCheckoutConfig();
  if(!username||!password)throw Error("Payment gateway is not configured");
  const {data:tenant,error:te}=await admin.from("tenants").select("subscription_status,subscription_ends_at").eq("id",p.tenant_id).single();
  if(te||tenant?.subscription_status!=="active"||(tenant.subscription_ends_at&&new Date(tenant.subscription_ends_at)<=new Date()))throw Error("Activate or renew your paid subscription before adding asset blocks.");
  const {data:settings,error:se}=await admin.from("saas_settings").select("currency,extra_asset_block_price,extra_asset_block_size").eq("id",true).single();
  if(se||!settings)throw Error("Asset capacity pricing not configured");
  if(String(settings.currency).toUpperCase()!=="USD")throw Error("SaaS prices must be configured in USD");
  const baseUnitPriceUsd=Number(settings.extra_asset_block_price),baseAmountUsd=baseUnitPriceUsd*data.quantity;
  if(!Number.isFinite(baseAmountUsd)||baseAmountUsd<=0)throw Error("SaaS Admin must configure a positive extra-asset block price");
  const quote=await currentUsdUgxQuote(true);
  if(!quote)throw Error("Verified exchange rate unavailable");
  const unitPrice=usdToUgx(baseUnitPriceUsd,quote.rate),amount=usdToUgx(baseAmountUsd,quote.rate);
  const phone=data.phone;
  
  const {data:tx,error}=await admin.from("asset_capacity_purchases").insert({tenant_id:p.tenant_id,user_id:context.userId,blocks:data.quantity,block_size:Number(settings.extra_asset_block_size),unit_price:unitPrice,amount,currency:"UGX",base_amount_usd:baseAmountUsd,conversion_rate:quote.rate,conversion_timestamp:quote.updatedAt,phone}).select("id").single();
  if(error||!tx)throw Error(error?.message||"Could not create purchase");
  const xml='<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>'+
   '<APIUsername>'+xmlEscape(username)+'</APIUsername><APIPassword>'+xmlEscape(password)+'</APIPassword>'+
   '<Method>acdepositfunds</Method><NonBlocking>TRUE</NonBlocking><Account>'+xmlEscape(phone)+'</Account><Amount>'+xmlEscape(amount)+'</Amount>'+
   '<Narrative>'+xmlEscape("AssetFlow "+data.quantity+" extra user asset blocks")+'</Narrative><ExternalReference>'+xmlEscape(tx.id)+'</ExternalReference></Request></AutoCreate>';
  try{
    const raw=await yoRequest(xml,mode),reference=xmlTag(raw,"TransactionReference"),status=xmlTag(raw,"Status");
    await admin.from("asset_capacity_purchases").update({provider_reference:reference||null,status:status==="OK"?"pending":"failed"}).eq("id",tx.id);
    if(status!=="OK")throw Error(xmlTag(raw,"ErrorMessage")||xmlTag(raw,"StatusMessage")||"Payment was rejected");
    return {transactionId:tx.id,status:xmlTag(raw,"TransactionStatus")||"PENDING"};
  }catch(e){await admin.from("asset_capacity_purchases").update({status:"failed"}).eq("id",tx.id);throw e}
 });

export const checkYoAssetCapacityPurchase=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({transactionId:z.string().uuid()}).parse(input))
 .handler(async ({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
    const {username,password,mode}=await getYoCheckoutConfig();
  if(!username||!password)throw Error("Payment gateway unavailable");
  const {data:tx,error}=await admin.from("asset_capacity_purchases").select("*").eq("id",data.transactionId).eq("tenant_id",p.tenant_id).single();
  if(error||!tx)throw Error("Asset capacity purchase not found");
  if(tx.status==="successful")return {successful:true,status:"SUCCEEDED"};
  if(tx.status!=="pending"||!tx.provider_reference)throw Error("Payment is not pending");
  const xml='<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request><APIUsername>'+xmlEscape(username)+'</APIUsername><APIPassword>'+xmlEscape(password)+'</APIPassword><Method>actransactioncheckstatus</Method><TransactionReference>'+xmlEscape(tx.provider_reference)+'</TransactionReference><PrivateTransactionReference>'+xmlEscape(tx.id)+'</PrivateTransactionReference><DepositTransactionType>PULL</DepositTransactionType></Request></AutoCreate>';
  const raw=await yoRequest(xml,mode),status=xmlTag(raw,"TransactionStatus").toUpperCase();
  if(status==="SUCCEEDED"){
   const {error:activationError}=await admin.rpc("activate_asset_capacity_purchase",{p_id:tx.id,p_tenant:p.tenant_id});
   if(activationError)throw Error(activationError.message);
  }else if(status==="FAILED")await admin.from("asset_capacity_purchases").update({status:"failed"}).eq("id",tx.id);
  return {successful:status==="SUCCEEDED",status};
 });


/** Country add-ons cost 80% of the verified base-country subscription amount
 * for countries 2-6, then 50% from country 7 onward.
 * Every additional country must be paid before gaining access.
 */
export const getCountryExpansionQuote=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({country_code:z.string().length(2)}).parse(input))
 .handler(async({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
  const code=data.country_code.toUpperCase();
  const {data:country}=await admin.from("geo_countries").select("code,name").eq("code",code).eq("enabled",true).maybeSingle();
  if(!country)throw Error("Unsupported country");
  const {data:t,error}=await admin.from("tenants").select("id,subscription_status,subscription_ends_at,last_manual_activation_amount_ugx,plan_code")
    .eq("id",p.tenant_id).single();
  if(error||!t||t.subscription_status!=="active"||!t.subscription_ends_at||new Date(t.subscription_ends_at)<=new Date())
   throw Error("An active base-country subscription is required");
  const {data:settings}=await admin.from("tenant_location_settings")
    .select("default_country_code").eq("tenant_id",p.tenant_id).maybeSingle();
  if(code===settings?.default_country_code)throw Error("This is already your included country");
  const {data:extras,error:ee}=await admin.from("tenant_country_entitlements")
   .select("country_code,ends_at").eq("tenant_id",p.tenant_id).gt("ends_at",new Date().toISOString());
  if(ee)throw Error(ee.message);
  if((extras||[]).some((e:any)=>e.country_code===code))throw Error("Country already paid and enabled");
  const {data:verified,error:ve}=await admin.from("billing_transactions")
    .select("amount,currency").eq("tenant_id",p.tenant_id)
    .eq("status","successful").not("plan_code","is",null)
    .order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(ve)throw Error(ve.message);
  let base=Number(verified?.currency==="UGX"?verified.amount:t.last_manual_activation_amount_ugx);
  if(!Number.isFinite(base)||base<=0)
   throw Error("Verified base-country payment amount unavailable. Contact AssetFlow Operations before adding countries.");
  const additionalIndex=(extras?.length??0)+1;
  const quoted=Math.round(base*(additionalIndex<=5?0.8:0.5));
  return {countryCode:code,countryName:country.name,baseAmountUgx:base,
    additionalIndex,discountPercent:additionalIndex<=5?20:50,
    priceUgx:quoted,renewalDate:t.subscription_ends_at};
 });

export const startYoCountryExpansionPurchase=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({country_code:z.string().length(2),phone:ugandanMobileMoneyPhoneSchema}).parse(input))
 .handler(async({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
  const quote=await (async()=>{
   const headers={};
   // Recalculate on the server using the same authoritative records, never the UI price.
   const code=data.country_code.toUpperCase();
   const t=(await queryPostgres<{
    subscription_ends_at:string;last_manual_activation_amount_ugx:string|null
   }>(`SELECT subscription_ends_at,last_manual_activation_amount_ugx FROM public.tenants
       WHERE id=$1 AND subscription_status='active' AND subscription_ends_at>now()`,[p.tenant_id]))[0];
   if(!t)throw Error("Base subscription is not currently active");
   const country=(await queryPostgres<{name:string}>(`SELECT name FROM public.geo_countries WHERE code=$1 AND enabled=true`,[code]))[0];
   if(!country)throw Error("Invalid country");
   const loc=(await queryPostgres<{default_country_code:string}>(`SELECT default_country_code FROM public.tenant_location_settings WHERE tenant_id=$1`,[p.tenant_id]))[0];
   if(!loc?.default_country_code)throw Error("Select your included country first");
   if(loc.default_country_code===code)throw Error("Included country cannot be purchased");
   const extras=await queryPostgres<{country_code:string}>(`SELECT country_code FROM public.tenant_country_entitlements WHERE tenant_id=$1 AND ends_at>now()`,[p.tenant_id]);
   if(extras.some(e=>e.country_code===code))throw Error("Country is already active");
   const paid=(await queryPostgres<{amount:string}>(`SELECT amount FROM public.billing_transactions
     WHERE tenant_id=$1 AND status='successful' AND plan_code IS NOT NULL AND currency='UGX'
     ORDER BY updated_at DESC LIMIT 1`,[p.tenant_id]))[0];
   const base=Number(paid?.amount??t.last_manual_activation_amount_ugx);
   if(!Number.isFinite(base)||base<=0)throw Error("Base-country payment needs verification before an expansion charge");
   const index=extras.length+1;
   return {name:country.name,code,base,index,amount:Math.round(base*(index<=5?.8:.5))};
  })();
  const {username,password,mode}=await getYoCheckoutConfig();
  if(!username||!password)throw Error("Yo Uganda payments are not configured");
  const client=await getPostgresPool().connect();
  let quoteId:string;
  try{
   await client.query("BEGIN");
   await client.query("SELECT id FROM public.tenants WHERE id=$1 FOR UPDATE",[p.tenant_id]);
   const duplicate=(await client.query<{id:string}>(`SELECT id FROM public.tenant_country_quotes
     WHERE tenant_id=$1 AND country_code=$2 AND status='pending' AND expires_at>now()
     LIMIT 1 FOR UPDATE`,[p.tenant_id,quote.code])).rows[0];
   if(duplicate)throw Error("An active checkout already exists for this country");
   const order=(await client.query<{id:string}>(`INSERT INTO public.tenant_country_quotes
     (tenant_id,country_code,base_country_price,quoted_price,currency,country_index,user_id,phone)
     VALUES($1,$2,$3,$4,'UGX',$5,$6,$7) RETURNING id`,
     [p.tenant_id,quote.code,quote.base,quote.amount,quote.index,context.userId,data.phone])).rows[0];
   quoteId=order.id;
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
  const xml='<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>'+
   '<APIUsername>'+xmlEscape(username)+'</APIUsername><APIPassword>'+xmlEscape(password)+'</APIPassword>'+
   '<Method>acdepositfunds</Method><NonBlocking>TRUE</NonBlocking><Account>'+xmlEscape(data.phone)+'</Account>'+
   '<Amount>'+xmlEscape(quote.amount)+'</Amount>'+
   '<Narrative>'+xmlEscape("AssetFlow country expansion: "+quote.name)+'</Narrative>'+
   '<ExternalReference>'+xmlEscape(quoteId)+'</ExternalReference></Request></AutoCreate>';
  try{
   const raw=await yoRequest(xml,mode);
   const reference=xmlTag(raw,"TransactionReference"),status=xmlTag(raw,"Status");
   await queryPostgres(`UPDATE public.tenant_country_quotes SET provider_reference=$2,
    status=CASE WHEN $3='OK' THEN 'pending' ELSE 'cancelled' END WHERE id=$1`,
    [quoteId,reference||null,status]);
   if(status!=="OK"||!reference)throw Error(xmlTag(raw,"ErrorMessage")||"Payment request was rejected");
   return {transactionId:quoteId,status:"PENDING",amountUgx:quote.amount};
  }catch(error){
   await queryPostgres("UPDATE public.tenant_country_quotes SET status='cancelled' WHERE id=$1",[quoteId]);
   throw error;
  }
 });

export const checkYoCountryExpansionPurchase=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({transactionId:z.string().uuid()}).parse(input))
 .handler(async({data,context})=>{
  const p=await assertTenantAdmin(context.userId);
  const order=(await queryPostgres<{id:string;tenant_id:string;status:string;provider_reference:string;quoted_price:string}>(
   "SELECT id,tenant_id,status,provider_reference,quoted_price FROM public.tenant_country_quotes WHERE id=$1 AND tenant_id=$2",
   [data.transactionId,p.tenant_id]))[0];
  if(!order)throw Error("Country checkout not found");
  if(order.status==="paid")return {successful:true,status:"SUCCEEDED"};
  if(order.status!=="pending"||!order.provider_reference)throw Error("Country payment is not pending");
  const {username,password,mode}=await getYoCheckoutConfig();
  if(!username||!password)throw Error("Payment gateway is unavailable");
  const xml='<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>'+
   '<APIUsername>'+xmlEscape(username)+'</APIUsername><APIPassword>'+xmlEscape(password)+'</APIPassword>'+
   '<Method>actransactioncheckstatus</Method><TransactionReference>'+xmlEscape(order.provider_reference)+'</TransactionReference>'+
   '<PrivateTransactionReference>'+xmlEscape(order.id)+'</PrivateTransactionReference><DepositTransactionType>PULL</DepositTransactionType>'+
   '</Request></AutoCreate>';
  const raw=await yoRequest(xml,mode);
  const status=xmlTag(raw,"TransactionStatus").toUpperCase();
  if(status==="SUCCEEDED"){
   const amount=xmlTag(raw,"Amount"),currency=xmlTag(raw,"CurrencyCode");
   const responseRef=xmlTag(raw,"TransactionReference");
   if(responseRef&&responseRef!==order.provider_reference)throw Error("Gateway transaction reference mismatch");
   if(amount&&Math.abs(Number(amount)-Number(order.quoted_price))>1)throw Error("Gateway payment amount mismatch");
   if(currency&&currency.toUpperCase()!=="UGX")throw Error("Gateway payment currency mismatch");
   await queryPostgres("SELECT public.activate_verified_country_purchase($1,$2)",[order.id,p.tenant_id]);
  }else if(status==="FAILED"){
   await queryPostgres("UPDATE public.tenant_country_quotes SET status='cancelled' WHERE id=$1",[order.id]);
  }
  return {successful:status==="SUCCEEDED",status};
 });

export const getTenantCountryAddons=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const p=await assertTenantAdmin(context.userId);
  const countries=await queryPostgres<{country_code:string;ends_at:string;price_paid:string}>(
   `SELECT country_code,ends_at,price_paid FROM public.tenant_country_entitlements
      WHERE tenant_id=$1 AND ends_at>now() ORDER BY country_code`,[p.tenant_id]);
  return countries;
 });
