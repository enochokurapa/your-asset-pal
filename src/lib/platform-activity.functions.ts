import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
const db=supabaseAdmin as any;

export const getPlatformActivity=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator(input=>z.object({page:z.number().int().min(1).max(100)}).parse(input))
.handler(async({context,data})=>{
 const {data:admin,error:ae}=await db.from("profiles").select("is_saas_admin,is_active")
 .eq("id",context.userId).single();
 if(ae||!admin?.is_saas_admin||!admin.is_active)
  throw new Error("SaaS administrator access required");
 const pageSize=50;
 const {data:users,error:ue,count}=await db.from("profiles")
 .select("id,email,full_name,tenant_role,is_saas_admin,is_active,tenant_id,created_at",
 {count:"exact"}).order("created_at",{ascending:false})
 .range((data.page-1)*pageSize,data.page*pageSize-1);
 if(ue)throw new Error("Unable to load platform users");
 const ids=(users??[]).map((u:any)=>u.id);
 const {data:events,error:ee}=ids.length?await db.from("audit_log")
 .select("actor_user_id,action,entity_type,created_at")
 .in("actor_user_id",ids).order("created_at",{ascending:false}).limit(300):
 {data:[],error:null};
 if(ee)throw new Error("Unable to load activity records");
 const latest=new Map<string,string>();
 for(const event of events??[])if(event.actor_user_id&&!latest.has(event.actor_user_id))
  latest.set(event.actor_user_id,event.created_at);
 return {
  total:count??0,page:data.page,
  users:(users??[]).map((u:any)=>({
   id:u.id,email:u.email,name:u.full_name,isActive:u.is_active,
   role:u.is_saas_admin?"SaaS Admin":u.tenant_role,
   tenantId:u.tenant_id,createdAt:u.created_at,
   lastActivityAt:latest.get(u.id)??null
  })),
  events:(events??[]).map((e:any)=>({
   actorId:e.actor_user_id,action:e.action,entity:e.entity_type,at:e.created_at
  }))
 };
});
