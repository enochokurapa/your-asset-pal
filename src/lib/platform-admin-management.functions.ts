import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPostgresPool } from "@/lib/postgres.server";

const uuid=z.string().uuid();
const reason=z.string().trim().min(15).max(1000);

export const listPlatformAdministrators=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const pool=getPostgresPool();
  const {rows:[caller]}=await pool.query("SELECT is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE",[context.userId]);
  if(!caller?.is_saas_admin)throw Error("Platform administrator access required");
  const {rows:administrators}=await pool.query(
    "SELECT id,email,full_name,is_active,created_at FROM public.profiles WHERE is_saas_admin=TRUE ORDER BY created_at");
  return {administrators,maxActive:3};
 });

export const searchPlatformAdminCandidates=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({search:z.string().trim().min(3).max(120)}).parse(input))
 .handler(async({context,data})=>{
   const pool=getPostgresPool();
   const {rows:[actor]}=await pool.query("SELECT is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE",[context.userId]);
   if(!actor?.is_saas_admin)throw Error("Platform administrator access required");
   const {rows}=await pool.query(
     "SELECT id,email,full_name,tenant_id,tenant_role,is_active,is_saas_admin FROM public.profiles WHERE is_active=TRUE AND (email ILIKE $1 OR full_name ILIKE $1) ORDER BY is_saas_admin DESC,created_at DESC LIMIT 15",
     ["%"+data.search+"%"]);
   return rows;
 });

export const changePlatformAdministrator=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({
   targetUserId:uuid,makeAdmin:z.boolean(),reason,
   confirmEmail:z.string().email().max(254),
 }).parse(input))
 .handler(async({context,data})=>{
  if(context.userId===data.targetUserId)throw Error("You cannot change your own SaaS Admin privileges");
  const client=await getPostgresPool().connect();
  try{
   await client.query("BEGIN");
   await client.query("SELECT pg_advisory_xact_lock(20261112, 360)");
   const {rows:[caller]}=await client.query(
     "SELECT id,is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE FOR UPDATE",[context.userId]);
   if(!caller?.is_saas_admin)throw Error("Active SaaS administrator required");
   const {rows:[target]}=await client.query(
     "SELECT id,email,tenant_id,tenant_role,is_saas_admin,is_active FROM public.profiles WHERE id=$1 FOR UPDATE",[data.targetUserId]);
   if(!target?.is_active)throw Error("Target user not found or inactive");
   if(target.email?.trim().toLowerCase()!==data.confirmEmail.trim().toLowerCase())
     throw Error("Confirm the exact account email before changing platform access");
   if(Boolean(target.is_saas_admin)===data.makeAdmin)
     throw Error("This user already has the requested role");
   const {rows:[counts]}=await client.query(
     "SELECT COUNT(*)::int active_count FROM public.profiles WHERE is_active=TRUE AND is_saas_admin=TRUE");
   if(data.makeAdmin && counts.active_count>=3)throw Error("Maximum of three active SaaS Administrators");
   if(!data.makeAdmin && counts.active_count<=1)throw Error("The last SaaS Administrator cannot be removed");
   if(data.makeAdmin && target.tenant_id)
     throw Error("This user belongs to a business. Use a separate platform-only account to avoid changing business ownership or membership.");
   await client.query("UPDATE public.profiles SET is_saas_admin=$1 WHERE id=$2",
      [data.makeAdmin,data.targetUserId]);
   await client.query(
     "INSERT INTO public.platform_admin_membership_audit (actor_id,target_user_id,action,previous_state,new_state,reason) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)",[
      context.userId,data.targetUserId,data.makeAdmin?"promote":"demote",
      JSON.stringify({is_saas_admin:target.is_saas_admin}),
      JSON.stringify({is_saas_admin:data.makeAdmin}),data.reason,
     ]);
   await client.query("COMMIT");
   return {ok:true,userId:data.targetUserId,isSaasAdmin:data.makeAdmin};
  }catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
 });

export const listPlatformAdministratorAudit=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const pool=getPostgresPool();
  const {rows:[caller]}=await pool.query("SELECT is_saas_admin FROM public.profiles WHERE id=$1 AND is_active=TRUE",[context.userId]);
  if(!caller?.is_saas_admin)throw Error("Platform administrator required");
  const {rows}=await pool.query(
   "SELECT a.actor_id,a.target_user_id,a.action,a.reason,a.recorded_at,p.email AS target_email FROM public.platform_admin_membership_audit a JOIN public.profiles p ON p.id=a.target_user_id ORDER BY a.recorded_at DESC LIMIT 100");
  return rows;
 });
