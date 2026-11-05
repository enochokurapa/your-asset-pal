import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAssetVerificationPolicy, changeAssetVerificationPolicy } from "@/lib/asset-verification-policy.server";

export const getAssetVerificationPolicy = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(({context})=>readAssetVerificationPolicy(context.userId));

export const updateAssetVerificationPolicy = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({intervalMonths:z.number().int().min(1).max(60)}).parse(input))
  .handler(({context,data})=>changeAssetVerificationPolicy(context.userId,data.intervalMonths));
