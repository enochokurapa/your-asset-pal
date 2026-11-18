import {getPostgresPool,queryPostgres} from "@/lib/postgres.server";
import {sendPlatformOperationsNotice} from "@/lib/platform-smtp.server";
import {randomUUID} from "node:crypto";
import {createAssetFlowActivationReceipt} from "@/lib/assetflow-activation-receipt.server";
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
 const businessRecipient=r&&emailOk(r.email)?r:null;
 const plan=(await queryPostgres<{included_users:number;included_assets:number;features:string[]|null}>(
   "SELECT included_users,included_assets,features FROM public.saas_pricing_plans WHERE id=$1",[t.plan_code]))[0];

 const users=t.paid_users_unlimited?"Unlimited":String(
    (t.paid_user_limit_override??plan?.included_users??0)+(t.paid_user_limit_override===null?Number(t.purchased_extra_users??0):0));
 const assets=t.paid_asset_limit_override===-1?"Unlimited":String(
    (t.paid_asset_limit_override??plan?.included_assets??0)+(t.paid_asset_limit_override===null?Number(t.purchased_extra_assets??0):0));
 const reference=source.type==="payment"?source.transactionId:source.eventId;
 const eventKey=source.type==="payment"?"payment-activation:"+source.transactionId:"admin-activation:"+source.eventId;
 // A DB sequence guarantees unique cumulative numbers across concurrent activations.
 // Retrying the same activation returns its original number.
 let method=t.last_manual_activation_method==="admin_grant"?"Administrator grant":
   t.last_manual_activation_method==="cash"?"Cash":
   t.last_manual_activation_method==="bank_transfer"?"Bank transfer":
   t.last_manual_activation_method==="external_mobile_money"?"Mobile money":"Administrator approval";
 let amount:number|null=t.last_manual_activation_amount_ugx===null?null:Number(t.last_manual_activation_amount_ugx);
 let currency="UGX";
 let paymentReference:string|null=source.type==="admin"?reference:null;
 let paid=t.last_manual_activation_method!=="admin_grant"&&amount!==null&&Number.isFinite(amount)&&amount>0;
 if(source.type==="payment"){
  const tx=(await queryPostgres<{amount:string;currency:string;provider:string;provider_reference:string;status:string}>(
   `SELECT amount,currency,provider,provider_reference,status FROM public.billing_transactions WHERE id=$1 AND tenant_id=$2`,
   [source.transactionId,tenantId]))[0];
  if(!tx||tx.status!=="successful")return;
  amount=Number(tx.amount);currency=tx.currency||"UGX";
  method=tx.provider||"Online payment";paymentReference=tx.provider_reference||source.transactionId;
  paid=Number.isFinite(amount)&&amount>0;
 }
 const planLabel=t.plan_code==="paid"?"Paid Subscription":
   t.plan_code==="starter"?"Starter":t.plan_code==="business"?"Business":
   t.plan_code==="enterprise"?"Enterprise":t.plan_code;
 const numbered=(await queryPostgres<{receipt_no:string;issued_at:string}>(
  "SELECT receipt_no,issued_at FROM public.assetflow_issue_receipt_no($1)",[eventKey]))[0];
 if(!numbered)throw Error("Unable to issue a sequential receipt number");
 const receiptNo=numbered.receipt_no;
 const subject="AssetFlow360 | Subscription activated | "+t.name;
 const startDate=new Date(t.subscription_started_at||Date.now()).toLocaleDateString("en-GB",{timeZone:"Africa/Kampala"});
 const renewalDate=new Date(t.subscription_ends_at).toLocaleDateString("en-GB",{timeZone:"Africa/Kampala"});
 const body=[
   "Hello,",
   "Your "+t.name+" workspace is activated and ready for your team to use.",
   [
     "Issued by: OWLTECH Solutions Ltd.",
     "Issued to: "+t.name,
     "Document number: "+receiptNo,
     "Subscription: "+planLabel,
     "Activation date: "+startDate,
     "Renewal date: "+renewalDate,
     "Active users: "+users,
     "Asset capacity: "+assets,
     "Deliverables: Subscription access; "+users+" users; "+assets+" assets",
     ...(paid?["Amount paid: "+currency+" "+Number(amount).toLocaleString("en-UG"),
               "Payment method: "+method,
               "Payment reference: "+(paymentReference||reference)]:["Payment status: Not recorded","Activation method: "+method])
   ].join("\n"),
   paid?"Your official PDF payment receipt is attached for your accounts and filing records.":
     "Your workspace activation confirmation is attached as a PDF.",
   "You can sign in and continue registering, verifying and managing your organisation's assets.",
   "AssetFlow360 Operations"
 ].join("\n\n");
 const pdf=createAssetFlowActivationReceipt({
  receiptNo,workspace:t.name,plan:planLabel,
  activatedAt:new Date(t.subscription_started_at||Date.now()),
  expiresAt:new Date(t.subscription_ends_at),
  users,assets,method,amount,currency,paymentReference,paid,
  issuedAt:new Date(numbered.issued_at),features:Array.isArray(plan?.features)?plan.features:[]
 });
 const attachmentName=(paid?"AssetFlow360-Receipt-":"AssetFlow360-Activation-")+receiptNo+".pdf";
 if(businessRecipient){
  const rows=await queryPostgres<{id:string}>(
   "INSERT INTO public.platform_operations_campaigns (event_key,scope,tenant_id,subject,body,attachment_name,attachment_mime,attachment_data) VALUES($1,'activation',$2,$3,$4,$5,'application/pdf',$6) ON CONFLICT(event_key) DO NOTHING RETURNING id",
   [eventKey,tenantId,subject,body,attachmentName,pdf]);
  if(rows.length){
   await queryPostgres(
    "INSERT INTO public.platform_operations_deliveries(campaign_id,user_id,to_email) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [rows[0].id,businessRecipient.id,businessRecipient.email]);
   await queryPostgres(
    "INSERT INTO public.notifications(user_id,tenant_id,type,title,body,beep) VALUES($1,$2,'operations',$3,$4,true)",
    [businessRecipient.id,tenantId,subject,body.slice(0,1000)]);
  }
 }
 // A separate, idempotent email event ensures that SaaS administrators receive
 // the official PDF regardless of the business-recipient queue state.
 const platformAdmins=(await queryPostgres<{id:string;email:string}>(
  "SELECT id,email FROM public.profiles WHERE is_saas_admin=true AND is_active=true AND email IS NOT NULL ORDER BY created_at LIMIT 50"
 )).filter(item=>emailOk(item.email));
 if(platformAdmins.length){
  const adminSubject="AssetFlow360 | Business activated: "+t.name;
  const adminBody=[
   "A business workspace has been activated on AssetFlow360.",
   [
    "Issuer: OWLTECH Solutions Ltd.",
    "Business: "+t.name,
    "Document number: "+receiptNo,
    "Plan: "+planLabel,
    "Activation date: "+startDate,
    "Renewal date: "+renewalDate,
    "Users: "+users,
    "Asset capacity: "+assets,
    "Activation reference: "+reference,
    "Deliverables: Subscription access; "+users+" users; "+assets+" assets",
    "Payment status: "+(paid?"Payment confirmed":"No confirmed payment recorded"),
    ...(paid?["Amount paid: "+currency+" "+Number(amount).toLocaleString("en-UG"),"Method: "+method,
              "Payment reference: "+(paymentReference||reference)]:["Activation method: "+method])
   ].join("\n"),
   "The official activation confirmation or payment receipt is attached as a PDF.",
   "AssetFlow360 Operations"
  ].join("\n\n");
  const adminRows=await queryPostgres<{id:string}>(
   "INSERT INTO public.platform_operations_campaigns (event_key,scope,tenant_id,subject,body,attachment_name,attachment_mime,attachment_data) VALUES($1,'activation',$2,$3,$4,$5,'application/pdf',$6) ON CONFLICT(event_key) DO NOTHING RETURNING id",
   [eventKey+":saas-admin-copy",tenantId,adminSubject,adminBody,attachmentName,pdf]);
  if(adminRows.length){
   for(const admin of platformAdmins){
    await queryPostgres(
     "INSERT INTO public.platform_operations_deliveries(campaign_id,user_id,to_email) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
     [adminRows[0].id,admin.id,admin.email]);
    await queryPostgres(
     "INSERT INTO public.notifications(user_id,tenant_id,type,title,body,beep) VALUES($1,$2,'operations',$3,$4,true)",
     [admin.id,tenantId,adminSubject,adminBody.slice(0,1000)]);
   }
  }
 }
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
