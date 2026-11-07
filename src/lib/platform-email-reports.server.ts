import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformPdfReportEmail } from "@/lib/platform-smtp.server";
import { jsPDF } from "jspdf";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

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
  const pdf=new jsPDF({unit:"mm",format:"a4"});
  const width=210,margin=18;
  pdf.setFillColor(25,54,80);
  pdf.rect(0,0,width,49,"F");
  pdf.setFillColor(210,108,54);
  pdf.rect(0,0,5,49,"F");
  // Use the administrator's live platform logo, falling back to the bundled icon.
  try {
   const {data:brand}=await db.from("saas_settings").select("platform_logo_data_url,platform_icon_data_url").eq("id",true).maybeSingle();
   const raw=String(brand?.platform_logo_data_url||brand?.platform_icon_data_url||"");
   const match=/^data:image\/(?:png|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
   let icon:Buffer;
   if(match){icon=Buffer.from(await sharp(Buffer.from(match[1],"base64"),{limitInputPixels:16000000}).resize(144,144,{fit:"contain"}).png().toBuffer());}
   else {icon=await readFile(".output/public/icon-192.png");}
   pdf.addImage(icon.toString("base64"),"PNG",margin,10,27,27);
  }catch(error){console.error("[Email reports] Could not render platform logo",error);}
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(22);
  pdf.setTextColor(255,255,255);
  pdf.text("AssetFlow360",margin+34,23);
  pdf.setFontSize(10);
  pdf.setFont("helvetica","normal");
  pdf.text("ASSET MANAGEMENT  /  REPORTING",margin+34,32);
  pdf.setTextColor(35,52,68);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(17);
  pdf.text(frequency==="monthly"?"Monthly Asset Summary":"Daily Asset Summary",margin,67);
  pdf.setFontSize(10);
  pdf.setFont("helvetica","normal");
  const organization=tenant.name.replace(/[\r\n]/g," ").slice(0,115);
  const orgLines=pdf.splitTextToSize("Organization: "+organization,width-2*margin);
  pdf.text(orgLines,margin,77);
  let y=77+orgLines.length*5+5;
  pdf.text("Reporting period: "+key,margin,y);
  y+=12;
  const metrics=[
   ["Total registered assets",assets],
   ["Assets registered during reporting window",newAssets],
   ["Registered user accounts",users],
   ["Recorded audit events",activity]
  ] as const;
  for(const [label,value] of metrics){
   pdf.setFillColor(245,248,251);
   pdf.roundedRect(margin,y,width-2*margin,17,2,2,"F");
   pdf.setTextColor(51,68,83);
   pdf.setFont("helvetica","normal");
   pdf.setFontSize(10);
   pdf.text(label,margin+5,y+10);
   pdf.setFont("helvetica","bold");
   pdf.setFontSize(14);
   pdf.text(value.toLocaleString("en-GB"),width-margin-6,y+11,{align:"right"});
   y+=22;
  }
  y+=8;
  pdf.setFont("helvetica","normal");
  pdf.setTextColor(88,102,115);
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize("This report provides aggregate statistics only. It does not include individual asset identifiers or personal information.",width-2*margin),margin,y);
  pdf.setDrawColor(213,222,230);
  pdf.line(margin,269,width-margin,269);
  pdf.setFontSize(8);
  pdf.text("AssetFlow360  |  Confidential operational summary",margin,276);
  pdf.text("assetflow360.com",width-margin,276,{align:"right"});
  const buffer=Buffer.from(pdf.output("arraybuffer"));
  const filename="AssetFlow360-"+frequency+"-summary-"+key+".pdf";
  for(const to of verified.slice(0,3)){
   await sendPlatformPdfReportEmail(to,"AssetFlow360 | "+(frequency==="monthly"?"Monthly":"Daily")+" Asset Summary",buffer,filename);
  }
 }catch(e){
  // Retain the period claim even after an error: SMTP may already have
  // accepted a recipient, so automatic retries could deliver duplicates.
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
  if(policy.frequency==="monthly" && t.day!=="01")return;
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
