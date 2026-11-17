import {getPostgresPool,queryPostgres} from "@/lib/postgres.server";
import {sendPlatformOperationsNotice} from "@/lib/platform-smtp.server";
import {randomUUID} from "node:crypto";
type Recipient={id:string,email:string,tenant_id:string};
type NewCampaign={scope:"all"|"business"|"user";tenantId?:string;userId?:string;subject:string;body:string;attachment?:{name:string;mime:string;base64:string}};
let processing=false;
async function requirePlatformAdmin(id:string){
 const rows=await queryPostgres<{ok:boolean}>(
  "SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=$1 AND is_saas_admin=true AND is_active=true) AS ok",[id]);
 if(!rows[0]?.ok)throw Error("Active SaaS administrator required");
}
function emailOk(email:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<251}
export async function publishOperationsNotice(actor:string,input:NewCampaign){
 await requirePlatformAdmin(actor);
 const subject=input.subject.trim(),body=input.body.trim();
 if(!subject||subject.length>170||!body||body.length>6000)throw Error("Subject or message length invalid");
 const attach=input.attachment;
 let attachment:Buffer|null=null;
 if(attach){
  if(!/^[a-zA-Z0-9._ -]{1,100}$/.test(attach.name))throw Error("Invalid attachment name");
  if(!["application/pdf","image/jpeg","image/png","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(attach.mime))throw Error("File type not supported");
  if(attach.base64.length>720000||!/^[A-Za-z0-9+/=]+$/.test(attach.base64))throw Error("Attachment exceeds limit");
  attachment=Buffer.from(attach.base64,"base64");
  if(attachment.length>512*1024)throw Error("Attachment must be below 512 KB");
 }
 if(input.scope==="business"&&!input.tenantId)throw Error("Choose a business");
 if(input.scope==="user"&&!input.userId)throw Error("Choose a recipient");
 const client=await getPostgresPool().connect();
 let count=0;
 try{
  await client.query("BEGIN");
  const filter=input.scope==="business"?"AND tenant_id=$1::uuid":input.scope==="user"?"AND id=$1::uuid":"";
  const param=input.scope==="business"?[input.tenantId]:input.scope==="user"?[input.userId]:[];
  const recipients=(await client.query<Recipient>(
   `SELECT id,email,tenant_id FROM public.profiles WHERE is_active=true AND is_saas_admin=false AND email IS NOT NULL AND email<>'' ${filter} ORDER BY created_at LIMIT 10001`,param)).rows.filter(x=>emailOk(x.email));
  if(!recipients.length)throw Error("No active recipients found");
  if(recipients.length>10000)throw Error("Recipient count exceeds safety limit");
  const campaign=(await client.query<{id:string}>(`INSERT INTO public.platform_operations_campaigns
   (created_by,scope,tenant_id,subject,body,attachment_name,attachment_mime,attachment_data)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
   [actor,input.scope,input.scope==="business"?input.tenantId:null,subject,body,attach?.name??null,attach?.mime??null,attachment])).rows[0];
  for(let i=0;i<recipients.length;i+=400){
   const slice=recipients.slice(i,i+400);
   await client.query(`INSERT INTO public.platform_operations_deliveries(campaign_id,user_id,to_email)
    SELECT $1,unnest($2::uuid[]),unnest($3::text[])`,
    [campaign.id,slice.map(x=>x.id),slice.map(x=>x.email)]);
   await client.query(`INSERT INTO public.notifications(user_id,tenant_id,type,title,body,beep)
    SELECT u.id,u.tenant_id,'operations', $1,$2,false
    FROM public.profiles u WHERE u.id=ANY($3::uuid[])`,
    [subject,body.slice(0,1000),slice.map(x=>x.id)]);
  }
  count=recipients.length;
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e}
 finally{client.release()}
 void flushOperationsNotices().catch(e=>console.error("[Operations notices] Delivery scheduler failed",e));
 return {queued:count};
}
export async function platformNoticeSummary(actor:string){
 await requirePlatformAdmin(actor);
 return queryPostgres<{id:string;subject:string;scope:string;created_at:string;total:number;sent:number;failed:number}>(
  `SELECT c.id,c.subject,c.scope,c.created_at,count(d.id)::int total,
   count(d.id) FILTER(WHERE d.status='sent')::int sent,
   count(d.id) FILTER(WHERE d.status='failed')::int failed
   FROM public.platform_operations_campaigns c LEFT JOIN public.platform_operations_deliveries d ON d.campaign_id=c.id
   GROUP BY c.id ORDER BY c.created_at DESC LIMIT 30`);
}
export async function queueTenantActivationNotice(
 tenantId:string,source:{type:"payment";transactionId:string}|{type:"admin";eventId:string}
){
 const t=(await queryPostgres<{
  id:string;name:string;plan_code:string;subscription_status:string;
  subscription_started_at:string;subscription_ends_at:string;
  paid_user_limit_override:number|null;paid_users_unlimited:boolean;paid_asset_limit_override:number|null;
  purchased_extra_users:number|null;purchased_extra_assets:number|null;
  last_manual_activation_amount_ugx:string|null;last_manual_activation_method:string|null
 }>(`SELECT id,name,plan_code,subscription_status,subscription_started_at,subscription_ends_at,
 paid_user_limit_override,paid_users_unlimited,paid_asset_limit_override,purchased_extra_users,purchased_extra_assets,
 last_manual_activation_amount_ugx,last_manual_activation_method
 FROM public.tenants WHERE id=$1`,[tenantId]))[0];
 if(!t||t.subscription_status!=="active"||!t.subscription_ends_at)return;
 const r=(await queryPostgres<Recipient>(`SELECT id,email,tenant_id FROM public.profiles
 WHERE tenant_id=$1 AND is_active=true AND email IS NOT NULL
 ORDER BY CASE WHEN tenant_role IN ('owner','admin','tenant_admin') THEN 0 ELSE 1 END,created_at LIMIT 1`,[tenantId]))[0];
 if(!r||!emailOk(r.email))return;
 const plan=(await queryPostgres<{included_users:number;included_assets:number}>(
   "SELECT included_users,included_assets FROM public.saas_pricing_plans WHERE id=$1",[t.plan_code]))[0];

 const users=t.paid_users_unlimited?"Unlimited":String(
    (t.paid_user_limit_override??plan?.included_users??0)+(t.paid_user_limit_override===null?Number(t.purchased_extra_users??0):0));
 const assets=t.paid_asset_limit_override===-1?"Unlimited":String(
    (t.paid_asset_limit_override??plan?.included_assets??0)+(t.paid_asset_limit_override===null?Number(t.purchased_extra_assets??0):0));
 let paymentText=t.last_manual_activation_method==="admin_grant"?
   "Activation type: Administrator-approved grant. No payment receipt was generated.":
   `Activation type: Administrator-confirmed external payment.
Payment method: ${t.last_manual_activation_method||"Not specified"}
Amount recorded as received: ${t.last_manual_activation_amount_ugx?"UGX "+t.last_manual_activation_amount_ugx:"Not recorded"}
This is an activation confirmation, not proof of a platform-collected payment.`;
 if(source.type==="payment"){
  const tx=(await queryPostgres<{amount:string;currency:string;provider:string;provider_reference:string;status:string}>(
   `SELECT amount,currency,provider,provider_reference,status FROM public.billing_transactions WHERE id=$1 AND tenant_id=$2`,
   [source.transactionId,tenantId]))[0];
  if(!tx||tx.status!=="successful")return;
  paymentText=`Payment confirmed: ${tx.currency} ${tx.amount}\nPayment provider: ${tx.provider||"Yo Uganda"}\nTransaction reference: ${tx.provider_reference||source.transactionId}\nReceipt / transaction ID: ${source.transactionId}`;
 }
 const subject="Your AssetFlow360 workspace is activated and live";
 const body=`Your workspace is activated and live!\n\nWorkspace: ${t.name}\nPlan: ${t.plan_code}\nActive user allowance: ${users}\nAsset allowance: ${assets}\nActivated: ${new Date(t.subscription_started_at).toLocaleDateString("en-GB",{timeZone:"Africa/Kampala"})}\nExpiry / next renewal due: ${new Date(t.subscription_ends_at).toLocaleDateString("en-GB",{timeZone:"Africa/Kampala"})}\n\n${paymentText}\n\nYour team can now sign in and continue registering, verifying and managing assets.\n\nVisit https://assetflow360.com/login\n\nAssetFlow Operations`;
 const eventKey=source.type==="payment"?"payment-activation:"+source.transactionId:"admin-activation:"+source.eventId;
 const rows=await queryPostgres<{id:string}>(`INSERT INTO public.platform_operations_campaigns
 (event_key,scope,tenant_id,subject,body) VALUES($1,'activation',$2,$3,$4) ON CONFLICT(event_key) DO NOTHING RETURNING id`,
 [eventKey,tenantId,subject,body]);
 if(!rows.length)return;
 await queryPostgres(`INSERT INTO public.platform_operations_deliveries(campaign_id,user_id,to_email)
 VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[rows[0].id,r.id,r.email]);
 await queryPostgres(`INSERT INTO public.notifications(user_id,tenant_id,type,title,body,beep)
 VALUES($1,$2,'operations',$3,$4,true)`,[r.id,tenantId,subject,body.slice(0,1000)]);
 void flushOperationsNotices().catch(e=>console.error("[Activation notice] Mail queue error",e));
}
export async function flushOperationsNotices(){
 if(processing)return;processing=true;
 try{
  const items=await queryPostgres<{id:string;to_email:string;subject:string;body:string;attachment_name:string|null;attachment_mime:string|null;attachment_data:Buffer|null}>(
   `WITH next AS (SELECT id FROM public.platform_operations_deliveries
    WHERE status='pending' AND next_attempt_at<=now() ORDER BY created_at LIMIT 8 FOR UPDATE SKIP LOCKED)
    UPDATE public.platform_operations_deliveries d SET status='processing',attempts=attempts+1
    FROM next WHERE d.id=next.id RETURNING d.id,d.to_email,
    (SELECT subject FROM public.platform_operations_campaigns WHERE id=d.campaign_id) subject,
    (SELECT body FROM public.platform_operations_campaigns WHERE id=d.campaign_id) body,
    (SELECT attachment_name FROM public.platform_operations_campaigns WHERE id=d.campaign_id) attachment_name,
    (SELECT attachment_mime FROM public.platform_operations_campaigns WHERE id=d.campaign_id) attachment_mime,
    (SELECT attachment_data FROM public.platform_operations_campaigns WHERE id=d.campaign_id) attachment_data`);
  for(const item of items){
   try{
    await sendPlatformOperationsNotice(item.to_email,item.subject,item.body,
      item.attachment_data&&item.attachment_name&&item.attachment_mime?
      {name:item.attachment_name,mime:item.attachment_mime,data:item.attachment_data}:undefined);
    await queryPostgres("UPDATE public.platform_operations_deliveries SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1",[item.id]);
   }catch(e){
    console.error("[Operations notices] Delivery failure",String(e).slice(0,200));
    await queryPostgres(`UPDATE public.platform_operations_deliveries SET
     status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
     next_attempt_at=now()+interval '5 minutes',last_error=$2 WHERE id=$1`,
     [item.id,String(e).slice(0,400)]).catch(console.error);
   }
  }
 }finally{processing=false}
}
export function startOperationsNoticeScheduler(){
 const handle=setInterval(()=>{void flushOperationsNotices().catch(console.error)},60000);
 handle.unref?.();
}
