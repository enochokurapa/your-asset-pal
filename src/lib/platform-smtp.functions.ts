import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { smtpStatus, saveSmtp, smtpTest } from "@/lib/platform-smtp.server";

const schema=z.object({
 host:z.string().trim().min(4).max(253),
 port:z.union([z.literal(465),z.literal(587)]),
 username:z.string().trim().min(1).max(200),
 password:z.string().max(512),
 fromEmail:z.literal("no-reply@assetflow360.com"),
});
export const getPlatformSmtpSettings=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(({context})=>smtpStatus(context.userId));

export const savePlatformSmtpSettings=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(data=>schema.parse(data))
 .handler(({data,context})=>saveSmtp(context.userId,data));

export const testPlatformSmtpSettings=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(data=>z.object({to:z.string().email().max(250)}).parse(data))
 .handler(({data,context})=>smtpTest(context.userId,data.to));
