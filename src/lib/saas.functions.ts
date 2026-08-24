import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveTxt } from "node:dns/promises";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

export const getSaasContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await getProfile(context.userId);
    const [{ data: tenant }, { data: settings }, { data: modules }, { data: overrides }] = await Promise.all([
      admin.from("tenants").select("*").eq("id", profile.tenant_id).maybeSingle(),
      admin.from("saas_settings").select("*").eq("id", true).single(),
      admin.from("saas_modules").select("*").order("sort_order"),
      profile.tenant_id
        ? admin.from("tenant_module_overrides").select("module_key,enabled").eq("tenant_id", profile.tenant_id)
        : Promise.resolve({ data: [] }),
    ]);

    const status = computeStatus(tenant);
    const paid = status === "active";
    const overrideMap = new Map((overrides ?? []).map((x: any) => [x.module_key, x.enabled]));
    const enabledModules = (modules ?? [])
      .filter((m: any) => {
        if (!m.globally_enabled) return false;
        const planEnabled = paid ? m.paid_enabled : m.trial_enabled;
        if (!planEnabled) return false;
        return overrideMap.has(m.module_key) ? overrideMap.get(m.module_key) !== false : true;
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
        trialDays: settings?.trial_days ?? 28,
        trialUserLimit: settings?.trial_user_limit ?? 4,
        paidPrice: Number(settings?.paid_price ?? 0),
        currency: settings?.currency ?? "UGX",
      },
      enabledModules,
      canExportReports: paid,
      canUseCustomDomain: paid,
      paymentConfigured: Boolean(process.env.YO_API_USERNAME && process.env.YO_API_PASSWORD),
    };
  });

export const updateSaasSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    trial_days: z.number().int().min(1).max(365),
    trial_user_limit: z.number().int().min(1).max(10000),
    paid_price: z.number().min(0),
    currency: z.string().min(3).max(8),
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
    return { ok: true };
  });

export const updateSaasModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    module_key: z.string().min(1).max(100),
    globally_enabled: z.boolean(),
    trial_enabled: z.boolean(),
    paid_enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const { error } = await admin.from("saas_modules").update({
      globally_enabled: data.globally_enabled,
      trial_enabled: data.trial_enabled,
      paid_enabled: data.paid_enabled,
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
    enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const { error } = await admin.from("tenant_module_overrides").upsert({
      tenant_id: data.tenant_id,
      module_key: data.module_key,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,module_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTenantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tenant_id: z.string().uuid(),
    status: z.enum(["trial", "active", "expired", "suspended"]),
    plan_code: z.string().min(1).max(60).default("paid"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);
    const patch: any = {
      subscription_status: data.status,
      plan_code: data.status === "trial" ? "trial" : data.plan_code,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "active") {
      patch.subscription_started_at = new Date().toISOString();
      patch.subscription_ends_at = new Date(Date.now() + 30 * 86400000).toISOString();
    }
    const { error } = await admin.from("tenants").update(patch).eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
async function yoRequest(body: string) {
  const mode = (process.env.YO_API_MODE || "production").toLowerCase();
  const endpoint = process.env.YO_API_URL || (mode === "sandbox"
    ? "https://sandbox.yo.co.ug/services/yopaymentsdev/task.php"
    : "https://paymentsapi1.yo.co.ug/ybs/task.php");
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Payment gateway returned HTTP ${r.status}`);
  return text;
}

export const startYoUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: z.string().min(9).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const username = process.env.YO_API_USERNAME;
    const password = process.env.YO_API_PASSWORD;
    if (!username || !password) throw new Error("Payment gateway is not configured on this deployment yet");

    const { data: settings } = await admin.from("saas_settings").select("paid_price,currency").eq("id", true).single();
    const amount = Number(settings?.paid_price ?? 0);
    if (amount <= 0) throw new Error("The SaaS Admin has not set a paid-plan price yet");

    const phone = data.phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (!/^256\d{9}$/.test(phone)) throw new Error("Use a mobile-money number in format 2567XXXXXXXX");

    const { data: tx, error: txError } = await admin.from("billing_transactions").insert({
      tenant_id: p.tenant_id,
      phone,
      amount,
      currency: settings?.currency ?? "UGX",
      status: "pending",
    }).select().single();
    if (txError) throw new Error(txError.message);

    const xml = `<?xml version="1.0" encoding="UTF-8"?><AutoCreate><Request>` +
      `<APIUsername>${xmlEscape(username)}</APIUsername>` +
      `<APIPassword>${xmlEscape(password)}</APIPassword>` +
      `<Method>acdepositfunds</Method><NonBlocking>TRUE</NonBlocking>` +
      `<Account>${xmlEscape(phone)}</Account><Amount>${xmlEscape(amount)}</Amount>` +
      `<Narrative>${xmlEscape("AssetFlow paid plan upgrade")}</Narrative>` +
      `<ExternalReference>${xmlEscape(tx.id)}</ExternalReference>` +
      `</Request></AutoCreate>`;

    try {
      const raw = await yoRequest(xml);
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

export const checkYoUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ transaction_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertTenantAdmin(context.userId);
    const username = process.env.YO_API_USERNAME;
    const password = process.env.YO_API_PASSWORD;
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
    const raw = await yoRequest(xml);
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
    await admin.from("billing_transactions").update({
      status: successful ? "successful" : failed ? "failed" : "pending",
      raw_response: response,
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    if (successful) {
      await admin.from("tenants").update({
        subscription_status: "active",
        plan_code: "paid",
        subscription_started_at: new Date().toISOString(),
        subscription_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", p.tenant_id);
    }
    return { status: transactionStatus || "PENDING", successful, response };
  });
