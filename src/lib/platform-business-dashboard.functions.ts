import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {getPostgresPool} from "@/lib/postgres.server";

const uuid=z.string().uuid();
const recordKind=z.enum(["assets","categories","locations"]);
const allowedFields:Record<string,string[]>={
  assets:["name","description","asset_tag","serial_number","status","purchase_date","purchase_value","category_id","location_id"],
  categories:["name","description"],
  locations:["name","address"],
};
async function validate(client:any,admin:string,sessionId:string,lock=false){
 const {rows:[s]}=await client.query(
   "SELECT s.id,s.tenant_id,s.expires_at,t.name AS tenant_name,t.subscription_status FROM public.platform_tenant_access_sessions s JOIN public.profiles p ON p.id=$2 AND p.is_saas_admin=TRUE AND p.is_active=TRUE JOIN public.tenants t ON t.id=s.tenant_id WHERE s.id=$1 AND s.administrator_id=$2 AND s.ended_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>NOW())"+(lock?" FOR SHARE OF s":""),
   [sessionId,admin]);
 if(!s)throw new Error("SaaS Admin business access has expired. Open the business dashboard again.");
 return s;
}
async function audit(client:any,s:any,actor:string,action:string,details:Record<string,unknown>={}){
 await client.query("INSERT INTO public.platform_tenant_access_audit (session_id,tenant_id,actor_id,action,details) VALUES ($1,$2,$3,$4,$5::jsonb)",
  [s.id,s.tenant_id,actor,action,JSON.stringify(details)]);
}
export const openPlatformBusinessDashboard=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({tenantId:uuid}).parse(input))
 .handler(async({context,data})=>{
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const {rows:[actor]}=await c.query(
     "SELECT id FROM public.profiles WHERE id=$1 AND is_active=TRUE AND is_saas_admin=TRUE",[context.userId]);
   if(!actor)throw new Error("Only an active SaaS Administrator may open business dashboards");
   const {rows:[t]}=await c.query("SELECT id,name FROM public.tenants WHERE id=$1",[data.tenantId]);
   if(!t)throw new Error("Business not found");
   // Bound to this administrator's authenticated identity, never customer credentials.
   const {rows:[s]}=await c.query("INSERT INTO public.platform_tenant_access_sessions (tenant_id,administrator_id,reason) VALUES ($1,$2,'SaaS Admin direct business intervention') RETURNING id,tenant_id,expires_at",
    [data.tenantId,context.userId]);
   // The created session row records access; a page view is not an asset change.
   await c.query("COMMIT");
   return {sessionId:s.id,tenantId:t.id,expiresAt:s.expires_at};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
// Bootstrap uses the authenticated server, not a browser PostgREST RPC header.
// This prevents the original tenant UI from briefly falling back to SaaS Control Center.
export const resumePlatformBusinessSession=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({sessionId:uuid}).parse(input))
 .handler(async({context,data})=>{
  const pool=getPostgresPool();
  const {rows:[s]}=await pool.query(
   `SELECT s.id,s.tenant_id,s.expires_at,t.name AS tenant_name FROM public.platform_tenant_access_sessions s
      JOIN public.profiles p ON p.id=s.administrator_id
      JOIN public.tenants t ON t.id=s.tenant_id
      WHERE s.id=$1 AND s.administrator_id=$2 AND s.ended_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>NOW())
        AND p.is_saas_admin=TRUE AND p.is_active=TRUE LIMIT 1`,
    [data.sessionId,context.userId]);
  if(!s)throw Error("Business support session expired or not authorized");
  return {sessionId:s.id,tenantId:s.tenant_id,tenantName:s.tenant_name,expiresAt:s.expires_at};
 });
export const getPlatformBusinessDashboard=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({sessionId:uuid}).parse(input))
 .handler(async({context,data})=>{
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const s=await validate(c,context.userId,data.sessionId);
   const {rows:[m]}=await c.query(
    "SELECT COUNT(*)::int AS assets, COUNT(*) FILTER (WHERE status='in_use')::int AS in_use, COUNT(*) FILTER (WHERE status='in_storage')::int AS stored, COUNT(*) FILTER (WHERE status='under_repair')::int AS repair, COUNT(*) FILTER (WHERE status='retired')::int AS retired, COUNT(*) FILTER (WHERE status='missing')::int AS missing, COALESCE(SUM(purchase_value),0)::numeric AS value FROM public.assets WHERE tenant_id=$1",[s.tenant_id]);
   const {rows:[u]}=await c.query("SELECT COUNT(*)::int AS total FROM public.profiles WHERE tenant_id=$1 AND is_active=TRUE",[s.tenant_id]);
   const {rows:[l]}=await c.query("SELECT COUNT(*)::int AS total FROM public.locations WHERE tenant_id=$1",[s.tenant_id]);
   const {rows:[cat]}=await c.query("SELECT COUNT(*)::int AS total FROM public.categories WHERE tenant_id=$1",[s.tenant_id]);
   const {rows:recent}=await c.query("SELECT id,name,asset_tag,status,created_at FROM public.assets WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 10",[s.tenant_id]);
   // Diagnostic reads are not asset changes.
   await c.query("COMMIT");
   return {business:{id:s.tenant_id,name:s.tenant_name,status:s.subscription_status},expiresAt:s.expires_at,
    metrics:{...m,users:u.total,locations:l.total,categories:cat.total},recent};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
export const listPlatformBusinessRecords=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({sessionId:uuid,kind:recordKind,search:z.string().max(100).default("")}).parse(input))
 .handler(async({context,data})=>{
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const s=await validate(c,context.userId,data.sessionId);
   const columns=data.kind==="assets"?"id,name,asset_tag,serial_number,status,description,purchase_value,purchase_date,category_id,location_id,updated_at"
     :data.kind==="categories"?"id,name,description":"id,name,address";
   const {rows}=await c.query("SELECT "+columns+" FROM public."+data.kind+
    " WHERE tenant_id=$1 AND ($2='' OR name ILIKE $3) ORDER BY name LIMIT 100",[s.tenant_id,data.search,"%"+data.search+"%"]);
   // Listing customer records does not create a change audit entry.
   await c.query("COMMIT");
   return rows;
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
export const updatePlatformBusinessRecord=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({sessionId:uuid,kind:recordKind,recordId:uuid,field:z.string(),value:z.string().max(2000).nullable(),reason:z.string().trim().min(15).max(1000)}).parse(input))
 .handler(async({context,data})=>{
  if(!allowedFields[data.kind]?.includes(data.field))throw Error("This field is not allowed for direct support changes");
  if(data.field==="name"&&(!data.value?.trim()||data.value.length>200))throw Error("Valid name required");
  if(data.field==="status"&&!["in_use","in_storage","under_repair","retired","missing","disposed","checked_out"].includes(data.value??""))throw Error("Invalid status");
  if(["category_id","location_id"].includes(data.field)&&data.value!==null&&!uuid.safeParse(data.value).success)throw Error("Invalid related record");
  if(data.field==="purchase_value"&&data.value!==null&&!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(data.value))throw Error("Invalid amount");
  if(data.field==="purchase_date"&&data.value!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(data.value))throw Error("Invalid purchase date");
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const s=await validate(c,context.userId,data.sessionId,true);
   if(data.value&&["category_id","location_id"].includes(data.field)){
    const table=data.field==="category_id"?"categories":"locations";
    const {rowCount}=await c.query("SELECT 1 FROM public."+table+" WHERE id=$1 AND tenant_id=$2",[data.value,s.tenant_id]);
    if(!rowCount)throw Error("Reference belongs to another business");
   }
   const {rows:[old]}=await c.query("SELECT * FROM public."+data.kind+" WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[data.recordId,s.tenant_id]);
   if(!old)throw Error("Record not found in selected business");
   // Field and table are fixed server allowlists, and data remains parameterized.
   const {rows:[updated]}=await c.query("UPDATE public."+data.kind+" SET "+data.field+"=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [data.value,data.recordId,s.tenant_id]);
   if(data.kind==="assets")await audit(c,s,context.userId,"asset_record_changed",{
    kind:data.kind,recordId:data.recordId,field:data.field,before:old[data.field]??null,after:updated[data.field]??null,reason:data.reason});
   await c.query("COMMIT");
   return {ok:true};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
export const closePlatformBusinessDashboard=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({sessionId:uuid}).parse(input))
 .handler(async({context,data})=>{
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const s=await validate(c,context.userId,data.sessionId,true);
   await c.query("UPDATE public.platform_tenant_access_sessions SET ended_at=NOW() WHERE id=$1",[s.id]);
   // The ended_at field records session closure; no change audit entry.
   await c.query("COMMIT");
   return {ok:true};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
