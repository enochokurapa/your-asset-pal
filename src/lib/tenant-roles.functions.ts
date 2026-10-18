import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
const db=supabaseAdmin as any;
const roleInput=z.object({
  id:z.string().uuid().optional(),
  name:z.string().trim().min(2).max(70),
  description:z.string().max(500).default(""),
  base_role:z.enum(["manager","staff","security"]).default("staff"),
  modules:z.array(z.string()).max(40).default([]),
  actions:z.array(z.string()).max(60).default([]),
  approvals:z.array(z.string()).max(30).default([]),
});
async function tenant(userId:string) {
 const {data:p,error}=await db.from("profiles").select("tenant_id,tenant_role,is_active,is_saas_admin").eq("id",userId).single();
 if(error||!p?.tenant_id||!p.is_active||p.is_saas_admin||p.tenant_role!=="tenant_admin")throw Error("Business administrator required");
 return p.tenant_id as string;
}
async function ensureUser(tenantId:string,userId:string) {
 const {data,error}=await db.from("profiles").select("id,tenant_id,is_saas_admin,tenant_role").eq("id",userId).single();
 if(error||!data||data.tenant_id!==tenantId||data.is_saas_admin)throw Error("User does not belong to this business");
 if(data.tenant_role==="tenant_admin")throw Error("Business owners cannot be assigned a custom staff role");
}
async function apply(tenantId:string,userId:string,t:any){
 await ensureUser(tenantId,userId);
 // Apply the role's permissions to the existing authorization tables.
 const roleTable=await db.from("user_roles").delete().eq("user_id",userId);
 if(roleTable.error)throw Error(roleTable.error.message);
 const a=await db.from("user_roles").insert({user_id:userId,role:t.base_role});
 if(a.error)throw Error(a.error.message);
 for(const [table,field,values] of [
   ["user_permissions","module",t.modules],
   ["user_action_rights","action_kind",t.actions],
   ["user_approval_rights","approval_kind",t.approvals],
 ] as const){
   const del=await db.from(table).delete().eq("user_id",userId);
   if(del.error)throw Error(del.error.message);
   const records=[...new Set(values as string[])].map(v=>({user_id:userId,[field]:v,...(table==="user_permissions"?{can_view:true}:{})}));
   if(records.length){const ins=await db.from(table).insert(records);if(ins.error)throw Error(ins.error.message);}
 }
}
export const listTenantRoleTemplates=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const t=await tenant(context.userId);
 const [roles,assignments]=await Promise.all([
 db.from("tenant_role_templates").select("*").eq("tenant_id",t).order("name"),
 db.from("tenant_role_assignments").select("user_id,template_id").eq("tenant_id",t),
 ]);
 if(roles.error||assignments.error)throw Error(roles.error?.message||assignments.error?.message);
 return {roles:roles.data??[],assignments:assignments.data??[]};
});
export const saveTenantRoleTemplate=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(roleInput).handler(async({data,context})=>{
 const t=await tenant(context.userId);
 const payload={tenant_id:t,name:data.name,description:data.description,base_role:data.base_role,modules:data.modules,actions:data.actions,approvals:data.approvals};
 const op=data.id?db.from("tenant_role_templates").update(payload).eq("id",data.id).eq("tenant_id",t):
 db.from("tenant_role_templates").insert(payload);
 const {data:row,error}=await op.select("id").single();
 if(error||!row)throw Error(error?.message||"Role not saved");
 return row;
});
export const assignTenantRoleTemplate=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(z.object({userId:z.string().uuid(),templateId:z.string().uuid()}))
 .handler(async({context,data})=>{
 const t=await tenant(context.userId);
 if(data.userId===context.userId)throw Error("You cannot change your own administrator rights");
 const {data:r,error}=await db.from("tenant_role_templates").select("*").eq("id",data.templateId).eq("tenant_id",t).single();
 if(error||!r)throw Error("Role not found in this business");
 await apply(t,data.userId,r);
 const saved=await db.from("tenant_role_assignments").upsert({tenant_id:t,user_id:data.userId,template_id:r.id},{onConflict:"tenant_id,user_id"});
 if(saved.error)throw Error(saved.error.message);
 return {ok:true};
});
