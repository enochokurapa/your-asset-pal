import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformReportEmail } from "@/lib/platform-smtp.server";

const db=supabaseAdmin as any;
export type DigestFrequency="daily"|"monthly";
export type DigestSettings={enabled:boolean;frequency:DigestFrequency;send_hour:number};
let schedulerStarted=false;
let running=false;

async function requirePlatformAdmin(uid:string){
 const {data,error}=await db.from("profiles").select("is_saas_admin,is_active")
  .eq("id",uid).single();
 if(error||!data?.is_saas_admin||data.is_active!==true)throw Error("Active SaaS administrator required");
}
export async function getEmailReportSettings(uid:string):Promise<DigestSettings>{
 await requirePlatformAdmin(uid);
 const {data,error}=await db.from("platform_email_report_settings").select("enabled,frequency,send_hour").eq("id",true).single();
 if(error||!data)throw Error("Report schedule is unavailable");
 return data as DigestSettings;
}
export async function saveEmailReportSettings(uid:string,input:DigestSettings){
 await requirePlatformAdmin(uid);
 const {error}=await db.from("platform_email_report_settings").update({
  ...input,updated_at:new Date().toISOString(),updated_by:uid,
 }).eq("id",true);
 if(error)throw Error("Could not update automated email reporting policy");
 return {saved:true};
}
function localParts(now:Date){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Kampala",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"})
  .formatToParts(now);
 const get=(x:string)=>parts.find(p=>p.type===x)?.value||"";
 return {year:get("year"),month:get("month"),day:get("day"),hour:Number(get("hour"))};
}
async function countRows(table:string,tenantId:string,from?:string){
 let query=db.from(table).select("id",{count:"exact",head:true}).eq("tenant_id",tenantId);
 if(from)query=query.gte("created_at",from);
 const {count,error}=await query;
 if(error)throw Error("Unable to produce tenant report");
 return Number(count||0);
}
async function sendOneTenant(tenant:{id:string;name:string},frequency:DigestFrequency,key:string){
 const {data:admins,error}=await db.from("profiles")
  .select("id,email").eq("tenant_id",tenant.id).eq("tenant_role","tenant_admin").eq("is_active",true).limit(10);
 if(error||!admins?.length)return;
 const verified:string[]=[];
 for(const profile of admins){
  if(!profile.email)continue;
  const {data,error:lookupError}=await db.auth.admin.getUserById(profile.id);
  if(!lookupError&&data?.user?.email_confirmed_at&&data.user.email?.toLowerCase()===profile.email.toLowerCase()){
   verified.push(profile.email);
  }
 }
 if(!verified.length)return;
 const {data:claim,error:claimError}=await db.from("platform_email_report_deliveries")
  .upsert({tenant_id:tenant.id,frequency,period_key:key},{onConflict:"tenant_id,frequency,period_key",ignoreDuplicates:true})
  .select("tenant_id");
 if(claimError||!claim?.length)return;
 try{
  const from=new Date(Date.now()-(frequency==="daily"?86400000:31*86400000)).toISOString();
  const [assets,newAssets,users,activity]=await Promise.all([
   countRows("assets",tenant.id),countRows("assets",tenant.id,from),
   countRows("profiles",tenant.id),countRows("audit_log",tenant.id,from)
  ]);
  const content=[
   "Organization: "+tenant.name,
   "Reporting period: "+key+" ("+frequency+")",
   "Total registered assets: "+assets,
   "Assets registered during reporting window: "+newAssets,
   "Registered user accounts: "+users,
   "Recorded audit events during reporting window: "+activity,
   "",
   "For detailed records and approved exports, sign in to https://assetflow360.com.",
   "This summary intentionally excludes individual asset identifiers and personal information."
  ].join("\n");
  for(const to of verified.slice(0,3)){
   await sendPlatformReportEmail(to,"AssetFlow Operations | "+(frequency==="monthly"?"Monthly":"Daily")+" asset summary",content);
  }
 }catch(e){
  await db.from("platform_email_report_deliveries").delete().eq("tenant_id",tenant.id)
   .eq("frequency",frequency).eq("period_key",key);
  console.error("[Email reports] Delivery failed for tenant",tenant.id,e instanceof Error?e.message:"unknown");
 }
}
async function reportTick(){
 if(running||process.env.PLATFORM_EMAIL_REPORT_SCHEDULER_DISABLED==="true")return;
 running=true;
 try{
  const {data:policy,error}=await db.from("platform_email_report_settings")
    .select("enabled,frequency,send_hour").eq("id",true).single();
  if(error||policy?.enabled!==true)return;
  const now=new Date(),t=localParts(now);
  if(t.hour<Number(policy.send_hour))return;
  const frequency:DigestFrequency=policy.frequency==="daily"?"daily":"monthly";
  const key=t.year+"-"+t.month+(frequency==="daily"?"-"+t.day:"");
  const {data:tenants,error:tenantsError}=await db.from("tenants")
   .select("id,name,subscription_status,subscription_ends_at").eq("subscription_status","active")
   .order("created_at").limit(250);
  if(tenantsError)throw Error("Unable to read report tenant list");
  let processed=0;
  for(const tenant of tenants||[]){
   if(tenant.subscription_ends_at&&new Date(tenant.subscription_ends_at).getTime()<now.getTime())continue;
   if(processed++>=30)break;
   await sendOneTenant(tenant,frequency,key);
  }
 }catch(e){console.error("[Email reports] Scheduler check failed",e instanceof Error?e.message:"unknown")}
 finally{running=false;}
}
export function startPlatformEmailReportScheduler(){
 if(schedulerStarted||process.env.PLATFORM_EMAIL_REPORT_SCHEDULER_DISABLED==="true")return;
 schedulerStarted=true;
 const initial=setTimeout(()=>void reportTick(),60_000);
 const recurring=setInterval(()=>void reportTick(),30*60_000);
 initial.unref?.();recurring.unref?.();
}
