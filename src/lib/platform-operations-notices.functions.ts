import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {publishOperationsNotice,platformNoticeSummary} from "@/lib/platform-operations-notices.server";
import {queryPostgres} from "@/lib/postgres.server";
async function platformAdmin(id:string){
 const rows=await queryPostgres<{ok:boolean}>(
 "SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=$1 AND is_saas_admin=true AND is_active=true) ok",[id]);
 if(!rows[0]?.ok)throw Error("Administrator permission required");
}
const schema=z.object({
 scope:z.enum(["all","business","user"]),
 tenantId:z.string().uuid().optional(),
 userId:z.string().uuid().optional(),
 subject:z.string().min(3).max(170),
 body:z.string().min(5).max(6000),
 attachment:z.object({
  name:z.string().max(100),mime:z.string().max(120),
  base64:z.string().max(720000)
 }).optional(),
});
export const sendOperationsBroadcast=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>schema.parse(input))
 .handler(async ({context,data})=>publishOperationsNotice(context.userId,data));

export const getOperationsCampaigns=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(({context})=>platformNoticeSummary(context.userId));

export const getOperationsAudience=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  await platformAdmin(context.userId);
  const [tenants,users]=await Promise.all([
   queryPostgres<{id:string;name:string}>(`SELECT id,name FROM public.tenants ORDER BY name LIMIT 2000`),
   queryPostgres<{id:string;name:string;email:string}>(`SELECT id,coalesce(nullif(full_name,''),email) name,email FROM public.profiles WHERE is_active=true AND is_saas_admin=false AND email IS NOT NULL ORDER BY created_at DESC LIMIT 2000`),
  ]);
  return {tenants,users};
 });
