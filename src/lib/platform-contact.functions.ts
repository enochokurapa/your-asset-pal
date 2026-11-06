import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {queryPostgres} from "@/lib/postgres.server";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {sendPlatformReportEmail} from "@/lib/platform-smtp.server";

const email=z.string().trim().toLowerCase().email().max(254);
const submitSchema=z.object({
  name:z.string().trim().min(2).max(120),
  email,
  subject:z.string().trim().min(5).max(180),
  message:z.string().trim().min(10).max(6000),
  website:z.string().max(200).optional().default(""),
});
const statusSchema=z.enum(["new","in_progress","waiting_for_customer","resolved","closed"]);
type RequestRow={
 id:string;name:string;email:string;subject:string;message:string;status:string;
 assigned_to:string|null;created_at:string;updated_at:string;resolved_at:string|null;
};
type MessageRow={
 id:string;request_id:string;subject:string;body:string;delivery_status:string;
 created_at:string;delivered_at:string|null;admin_user_id:string|null;
};
export type ContactTemplate={id:string;title:string;subject:string;body:string;is_active:boolean};
async function adminOnly(id:string){
  const [a]=await queryPostgres<{id:string}>(`SELECT id FROM public.profiles
     WHERE id=$1 AND is_saas_admin=TRUE AND is_active=TRUE LIMIT 1`,[id]);
  if(!a)throw new Error("Active SaaS administrator required");
}
export const submitContactRequest=createServerFn({method:"POST"})
 .inputValidator(input=>submitSchema.parse(input))
 .handler(async({data})=>{
   // Honeypot prevents basic automated form submission; report success but do not store.
   if(data.website)return {received:true};
   const [recent]=await queryPostgres<{total:number}>(`
     SELECT COUNT(*)::int total FROM public.platform_contact_requests
     WHERE email=$1 AND created_at>NOW()-INTERVAL '1 hour'
   `,[data.email]);
   if(recent.total>=3)throw Error("Too many recent requests. Please try again later.");
   await queryPostgres(`INSERT INTO public.platform_contact_requests(name,email,subject,message)
       VALUES($1,$2,$3,$4)`,[data.name,data.email,data.subject,data.message]);
   return {received:true};
 });
export const getAdminContactRequests=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
   await adminOnly(context.userId);
   const requests=await queryPostgres<RequestRow>(`
     SELECT id,name,email,subject,message,status,assigned_to,created_at,updated_at,resolved_at
     FROM public.platform_contact_requests ORDER BY created_at DESC LIMIT 150`);
   const templates=await queryPostgres<ContactTemplate>(`
     SELECT id,title,subject,body,is_active FROM public.platform_contact_templates
     ORDER BY title LIMIT 60`);
   return {requests,templates};
 });
export const getAdminContactMessages=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({id:z.string().uuid()}).parse(input))
 .handler(async({data,context})=>{
   await adminOnly(context.userId);
   return queryPostgres<MessageRow>(`SELECT id,request_id,subject,body,delivery_status,created_at,
      delivered_at,admin_user_id FROM public.platform_contact_messages
      WHERE request_id=$1 ORDER BY created_at ASC LIMIT 120`,[data.id]);
 });
export const setAdminContactStatus=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({id:z.string().uuid(),status:statusSchema}).parse(input))
 .handler(async({context,data})=>{
   await adminOnly(context.userId);
   const changed=await queryPostgres<{id:string}>(`UPDATE public.platform_contact_requests
     SET status=$2,updated_at=NOW(),resolved_at=CASE WHEN $2 IN ('resolved','closed') THEN NOW() ELSE NULL END
     WHERE id=$1 RETURNING id`,[data.id,data.status]);
   if(!changed.length)throw Error("Contact request not found");
   return {ok:true};
 });
export const saveAdminContactTemplate=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({
   id:z.string().uuid().optional(),title:z.string().trim().min(3).max(90),
   subject:z.string().trim().min(3).max(180),body:z.string().trim().min(10).max(6000),
   is_active:z.boolean()
 }).parse(input))
 .handler(async({context,data})=>{
   await adminOnly(context.userId);
   if(data.id){
     const rows=await queryPostgres<{id:string}>(`UPDATE public.platform_contact_templates
       SET title=$2,subject=$3,body=$4,is_active=$5,updated_at=NOW()
       WHERE id=$1 RETURNING id`,[data.id,data.title,data.subject,data.body,data.is_active]);
     if(!rows.length)throw Error("Template not found");
   }else{
     const [count]=await queryPostgres<{total:number}>("SELECT COUNT(*)::int total FROM public.platform_contact_templates");
     if(count.total>=60)throw Error("Template limit reached");
     await queryPostgres(`INSERT INTO public.platform_contact_templates(title,subject,body,is_active)
         VALUES($1,$2,$3,$4)`,[data.title,data.subject,data.body,data.is_active]);
   }
   return {ok:true};
 });
export const sendAdminContactReply=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({
   id:z.string().uuid(),subject:z.string().trim().min(3).max(180),
   body:z.string().trim().min(2).max(6000)
 }).parse(input))
 .handler(async({context,data})=>{
   await adminOnly(context.userId);
   const [recipient]=await queryPostgres<{name:string;email:string;subject:string}>(`
      SELECT name,email,subject FROM public.platform_contact_requests WHERE id=$1 LIMIT 1`,[data.id]);
   if(!recipient)throw Error("Contact request not found");
   const interpolate=(v:string)=>v.replace(/{{name}}/gi,recipient.name)
     .replace(/{{subject}}/gi,recipient.subject);
   const subject=interpolate(data.subject).replace(/[\r\n]+/g," ").slice(0,180);
   const body=interpolate(data.body);
   // Queue the reply in the internal thread first; never claim sent until SMTP succeeds.
   const [saved]=await queryPostgres<{id:string}>(`
     INSERT INTO public.platform_contact_messages(request_id,admin_user_id,subject,body,delivery_status)
     VALUES($1,$2,$3,$4,'pending') RETURNING id
   `,[data.id,context.userId,subject,body]);
   try{
     await queryPostgres("UPDATE public.platform_contact_messages SET delivery_status='sending' WHERE id=$1",[saved.id]);
     await sendPlatformReportEmail(recipient.email,subject,body);
     await queryPostgres(`UPDATE public.platform_contact_messages SET delivery_status='sent',
       delivered_at=NOW() WHERE id=$1`,[saved.id]);
     await queryPostgres(`UPDATE public.platform_contact_requests
       SET status='waiting_for_customer',updated_at=NOW() WHERE id=$1`,[data.id]);
     return {delivered:true};
   }catch(err){
     await queryPostgres(`UPDATE public.platform_contact_messages SET delivery_status='failed',
       delivery_error='SMTP delivery failed' WHERE id=$1`,[saved.id]);
     throw Error("Reply was saved, but SMTP did not confirm delivery. Review the failed message before retrying.");
   }
 });
