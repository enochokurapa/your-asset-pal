import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {queryPostgres} from "@/lib/postgres.server";
const shape=z.object({
 presetId:z.enum(["ocean","forest","sunset","violet","graphite","gold"]),
 primary:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
 fontId:z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
});
async function tenantOf(userId:string,supportTenantId?:string){
 if(supportTenantId)return supportTenantId;
 const rows=await queryPostgres<{tenant_id:string|null}>("SELECT tenant_id FROM public.profiles WHERE id=$1 AND is_active=true",[userId]);
 if(!rows[0]?.tenant_id)throw Error("No active workspace");
 return rows[0].tenant_id;
}
export const getWorkspaceTheme=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
   const tenantId=await tenantOf(context.userId,context.supportTenantId);
   const rows=await queryPostgres<{ui_theme:any}>("SELECT ui_theme FROM public.tenants WHERE id=$1",[tenantId]);
   return shape.parse(rows[0]?.ui_theme??{presetId:"ocean"});
 });
export const saveWorkspaceTheme=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(x=>shape.parse(x))
 .handler(async({context,data})=>{
   const tenantId=await tenantOf(context.userId,context.supportTenantId);
   const allowed=await queryPostgres<{ok:boolean}>(`SELECT EXISTS(
     SELECT 1 FROM public.profiles p
     WHERE p.id=$1 AND p.is_active=true AND (
       (p.tenant_id=$2 AND (p.tenant_role='tenant_admin'
        OR EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='admin')))
       OR (p.is_saas_admin=true AND $3::boolean)
     )) ok`,[context.userId,tenantId,Boolean(context.supportTenantId)]);
   if(!allowed[0]?.ok)throw Error("Only a business administrator can change the workspace theme");
   await queryPostgres("UPDATE public.tenants SET ui_theme=$2::jsonb,updated_at=now() WHERE id=$1",
     [tenantId,JSON.stringify(data)]);
   return {ok:true};
 });
