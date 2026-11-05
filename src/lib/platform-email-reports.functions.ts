import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {getEmailReportSettings,saveEmailReportSettings} from "@/lib/platform-email-reports.server";
export const getPlatformEmailReports=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(({context})=>getEmailReportSettings(context.userId));
export const setPlatformEmailReports=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({enabled:z.boolean(),frequency:z.enum(["daily","monthly"]),send_hour:z.number().int().min(0).max(23)}).parse(input)).handler(({context,data})=>saveEmailReportSettings(context.userId,data));
