import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
const email=z.string().trim().toLowerCase().email().max(254);
const schema=z.object({user_id:z.string().uuid(),current_email:email,replacement_email:email});
export const requestSaasEmailRecovery=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>schema.parse(input))
 .handler(async({context,data})=>{
  const {initiateSaasEmailRecovery}=await import("@/lib/platform-email-recovery.server");
  return initiateSaasEmailRecovery({userId:context.userId},data);
 });
