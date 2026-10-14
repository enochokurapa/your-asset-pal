import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const admin = supabaseAdmin as any;

async function assertSaasAdmin(userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,is_saas_admin")
    .eq("id", userId)
    .single();

  if (error || !data?.is_saas_admin) {
    throw new Error("SaaS administrator privileges required");
  }
}

async function readGlobalPolicy() {
  const { data, error } = await admin
    .from("saas_settings")
    .select("trial_days,trial_user_limit,paid_price,currency,included_paid_users,extra_user_price,included_assets,extra_asset_block_size,extra_asset_block_price,updated_at")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "SaaS policy is not configured");
  }

  const trialDays = Number(data.trial_days);
  const trialUserLimit = Number(data.trial_user_limit);
  const paidPrice = Number(data.paid_price);

  if (!Number.isInteger(trialDays) || trialDays < 1) {
    throw new Error("The saved trial-day policy is invalid");
  }
  if (!Number.isInteger(trialUserLimit) || trialUserLimit < 1) {
    throw new Error("The saved trial user limit is invalid");
  }
  if (!Number.isFinite(paidPrice) || paidPrice < 0) {
    throw new Error("The saved paid-plan price is invalid");
  }
  if (!data.currency) {
    throw new Error("The saved SaaS currency is invalid");
  }

  return {
    trialDays,
    trialUserLimit,
    paidPrice,
    includedPaidUsers:Number(data.included_paid_users),extraUserPrice:Number(data.extra_user_price),includedAssets:Number(data.included_assets),extraAssetBlockSize:Number(data.extra_asset_block_size),extraAssetBlockPrice:Number(data.extra_asset_block_price),
    currency: String(data.currency).toUpperCase(),
    updatedAt: data.updated_at ?? null,
  };
}

export const getGlobalSaasPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSaasAdmin(context.userId);
    return readGlobalPolicy();
  });

export const updateGlobalSaasPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        trial_days: z.number().int().min(1).max(365),
        trial_user_limit: z.number().int().min(1).max(10000),
        paid_price: z.number().min(0),
        included_paid_users:z.number().int().min(1).max(100000),extra_user_price:z.number().min(0),included_assets:z.number().int().min(1).max(1000000000),extra_asset_block_size:z.number().int().min(1).max(10000000),extra_asset_block_price:z.number().min(0),
        currency: z.string().trim().min(3).max(8),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSaasAdmin(context.userId);

    const { error } = await admin
      .from("saas_settings")
      .update({
        trial_days: data.trial_days,
        trial_user_limit: data.trial_user_limit,
        paid_price: data.paid_price,
        included_paid_users:data.included_paid_users,extra_user_price:data.extra_user_price,included_assets:data.included_assets,extra_asset_block_size:data.extra_asset_block_size,extra_asset_block_price:data.extra_asset_block_price,
        currency: data.currency.toUpperCase(),
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", true);

    if (error) throw new Error(error.message);

    // The database trigger performs this automatically when trial_days changes.
    // Calling it explicitly makes the platform-wide effect deterministic even after
    // deployments from older schemas once this migration has been applied.
    const { data: affected, error: applyError } = await admin.rpc(
      "apply_current_saas_trial_policy",
    );
    if (applyError) {
      throw new Error(
        `Policy saved, but active trials could not be synchronized: ${applyError.message}`,
      );
    }

    return {
      ok: true,
      affectedTrialWorkspaces: Number(affected ?? 0),
      policy: await readGlobalPolicy(),
    };
  });
