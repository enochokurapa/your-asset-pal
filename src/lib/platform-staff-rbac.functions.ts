import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {getPostgresPool} from "@/lib/postgres.server";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
const uuid=z.string().uuid();
const role=z.enum(["finance","support","operations","viewer"]);
const reason=z.string().trim().min(15).max(1000);
const ROLE_PERMISSIONS={
 finance:["platform.billing.read","platform.revenue.read"],
 support:["platform.businesses.read","platform.support.read"],
 operations:["platform.businesses.read","platform.operations.read"],
 viewer:["platform.summary.read"],
} as const;
export const getPlatformRoleCatalog=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const {rows:[p]}=await getPostgresPool().query("SELECT is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE",[context.userId]);
  if(!p?.is_saas_admin)throw Error("SaaS Admin required");
  return ROLE_PERMISSIONS;
 });
async function assertAdmin(client:any,userId:string){
 const {rows:[p]}=await client.query("SELECT id FROM public.profiles WHERE id=$1 AND is_active=TRUE AND is_saas_admin=TRUE",[userId]);
 if(!p)throw Error("SaaS Admin required");
}
export const listPlatformUsersAndRoles=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const client=await getPostgresPool().connect();
  try{
   await assertAdmin(client,context.userId);
   const {rows}=await client.query(
    "SELECT p.id,p.email,p.full_name,p.is_active,p.is_saas_admin,m.role,p.tenant_id FROM public.profiles p LEFT JOIN public.platform_staff_memberships m ON m.user_id=p.id WHERE (m.user_id IS NOT NULL OR p.is_saas_admin=TRUE) ORDER BY p.is_saas_admin DESC,p.email LIMIT 200");
   return rows;
  }finally{client.release()}
 });
export const createPlatformStaffUser=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({email:z.string().email().max(254),name:z.string().trim().min(2).max(200),role,reason}).parse(input))
 .handler(async({context,data})=>{
  const pool=getPostgresPool();
  const c=await pool.connect();
  try{await assertAdmin(c,context.userId);}finally{c.release();}
  // Invite-based creation: no shared temporary password, email ownership verified by recipient.
  const {data:result,error}=await supabaseAdmin.auth.admin.inviteUserByEmail(data.email.trim().toLowerCase(),{
   data:{full_name:data.name},
   redirectTo:"https://assetflow360.com/welcome",
  });
  if(error||!result?.user?.id)throw Error(error?.message||"Could not send staff invitation");
  const userId=result.user.id;
  const db=await pool.connect();
  try{
   await db.query("BEGIN");
   await assertAdmin(db,context.userId);
   const {rows:[profile]}=await db.query(
    "SELECT id,tenant_id,is_saas_admin FROM public.profiles WHERE id=$1 FOR UPDATE",[userId]);
   if(!profile||profile.tenant_id||profile.is_saas_admin)throw Error("Cannot assign platform role to a business account");
   await db.query("UPDATE public.profiles SET full_name=$1,is_active=TRUE,is_saas_admin=FALSE WHERE id=$2",[data.name,userId]);
   await db.query("INSERT INTO public.platform_staff_memberships(user_id,role,assigned_by) VALUES($1,$2,$3)",[userId,data.role,context.userId]);
   await db.query("INSERT INTO public.platform_staff_role_audit(actor_id,target_id,event,new_role,reason) VALUES($1,$2,'staff_created',$3,$4)",
    [context.userId,userId,data.role,data.reason]);
   await db.query("COMMIT");
   return {id:userId,invited:true};
  }catch(e){
   await db.query("ROLLBACK");
   // Do not leave half-initialized accounts with privileges; invited account is nonprivileged until role write succeeds.
   throw e;
  }finally{db.release();}
 });
export const changePlatformStaffRole=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({userId:uuid,role:role.nullable(),reason}).parse(input))
 .handler(async({context,data})=>{
  if(data.userId===context.userId)throw Error("Cannot change your own platform role");
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   await assertAdmin(c,context.userId);
   const {rows:[p]}=await c.query("SELECT id,tenant_id,is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE FOR UPDATE",[data.userId]);
   if(!p||p.tenant_id||p.is_saas_admin)throw Error("Only standalone platform staff accounts can receive staff roles");
   const {rows:[previous]}=await c.query("SELECT role FROM public.platform_staff_memberships WHERE user_id=$1 FOR UPDATE",[data.userId]);
   if(data.role===null){
    await c.query("DELETE FROM public.platform_staff_memberships WHERE user_id=$1",[data.userId]);
   }else{
    await c.query("INSERT INTO public.platform_staff_memberships(user_id,role,assigned_by) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,assigned_by=EXCLUDED.assigned_by,assigned_at=NOW()",
      [data.userId,data.role,context.userId]);
   }
   await c.query("INSERT INTO public.platform_staff_role_audit(actor_id,target_id,event,prior_role,new_role,reason) VALUES($1,$2,$3,$4,$5,$6)",
      [context.userId,data.userId,data.role===null?"role_removed":"role_assigned",previous?.role??null,data.role,data.reason]);
   await c.query("COMMIT");
   return {ok:true};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
export const getMyPlatformStaffRole=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const {rows:[p]}=await getPostgresPool().query(
    "SELECT p.is_active,p.is_saas_admin,m.role FROM public.profiles p LEFT JOIN public.platform_staff_memberships m ON m.user_id=p.id WHERE p.id=$1",
    [context.userId]);
  if(!p?.is_active)return {role:null,permissions:[] as string[]};
  if(p.is_saas_admin)return {role:"saas_admin",permissions:["platform.*"]};
  const r=p.role as keyof typeof ROLE_PERMISSIONS;
  return {role:r||null,permissions:r?[...ROLE_PERMISSIONS[r]]:[]};
 });
export const getPlatformStaffOverview=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const c=await getPostgresPool().connect();
  try{
   const {rows:[p]}=await c.query(
    "SELECT p.is_active,p.is_saas_admin,m.role FROM public.profiles p LEFT JOIN public.platform_staff_memberships m ON m.user_id=p.id WHERE p.id=$1",[context.userId]);
   if(!p?.is_active||(!p.is_saas_admin&&!p.role))throw Error("Platform staff access required");
   const roleName=p.is_saas_admin?"saas_admin":p.role;
   const finance=p.is_saas_admin||roleName==="finance";
   const operations=p.is_saas_admin||["operations","support"].includes(roleName);
   const [tenants,activeUsers,assets,billing]=await Promise.all([
    c.query("SELECT COUNT(*)::int AS total FROM public.tenants"),
    operations?c.query("SELECT COUNT(*)::int AS total FROM public.profiles WHERE is_active=TRUE"):Promise.resolve({rows:[]}),
    operations?c.query("SELECT COUNT(*)::int AS total FROM public.assets"):Promise.resolve({rows:[]}),
    finance?c.query("SELECT COUNT(*)::int AS total FROM public.billing_transactions WHERE status='failed' AND created_at>=NOW()-INTERVAL '30 days'"):Promise.resolve({rows:[]}),
   ]);
   return {role:roleName,tenantCount:tenants.rows[0]?.total??0,
    ...(operations?{activeUsers:activeUsers.rows[0]?.total??0,assets:assets.rows[0]?.total??0}:{}),
    ...(finance?{failedPayments30Days:billing.rows[0]?.total??0}:{})};
  }finally{c.release();}
 });
