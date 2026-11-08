import {randomBytes,createHash} from "node:crypto";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {queryPostgres,getPostgresPool} from "@/lib/postgres.server";
import {sendPlatformEmailRecoveryLink} from "@/lib/platform-smtp.server";

const hexToken=/^[a-f0-9]{64}$/;
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");

export async function initiateSaasEmailRecovery(context:{userId:string},data:{user_id:string;current_email:string;replacement_email:string}){
  const admin=await queryPostgres<{is_saas_admin:boolean;is_active:boolean}>(`SELECT is_saas_admin,is_active FROM public.profiles WHERE id=$1`,[context.userId]);
  if(!admin[0]?.is_saas_admin||!admin[0]?.is_active)throw Error("Only an active SaaS administrator can change login emails");
  if(data.user_id===context.userId)throw Error("You cannot recover your own administrator login email here");
  if(data.current_email===data.replacement_email)throw Error("The replacement email must be different");
  const [target]=await queryPostgres<{id:string;email:string;tenant_id:string|null;is_saas_admin:boolean}>(`SELECT id,email,tenant_id,is_saas_admin FROM public.profiles WHERE id=$1`,[data.user_id]);
  if(!target||target.email.toLowerCase()!==data.current_email)throw Error("Account email changed. Refresh the user list and try again");
  if(target.is_saas_admin||!target.tenant_id)throw Error("This account cannot be changed using workspace recovery");
  const duplicates=await queryPostgres<{id:string}>(`SELECT id FROM auth.users WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1`,[data.replacement_email,data.user_id]);
  if(duplicates.length)throw Error("That email is already registered to another account");
  const recent=await queryPostgres<{count:number}>(`SELECT count(*)::integer AS count FROM public.platform_email_recovery_requests WHERE user_id=$1 AND created_at>now()-interval '24 hours'`,[data.user_id]);
  if((recent[0]?.count||0)>=3)throw Error("Too many recovery requests for this account. Try again later");
  const token=randomBytes(32).toString("hex");
  const [request]=await queryPostgres<{id:string}>(`INSERT INTO public.platform_email_recovery_requests(user_id,requested_by,tenant_id,previous_email,replacement_email,token_hash)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[data.user_id,context.userId,target.tenant_id,data.current_email,data.replacement_email,digest(token)]);
  const url="https://assetflow360.com/confirm-login-email#token="+token;
  try{await sendPlatformEmailRecoveryLink(data.replacement_email,url)}
  catch(error){
   await queryPostgres(`UPDATE public.platform_email_recovery_requests SET cancelled_at=now() WHERE id=$1`,[request.id]);
   console.error("[Email recovery] SMTP acceptance failed",error instanceof Error?error.name:"Unknown error");
   throw Error("Could not send the confirmation email. The login address has not changed.");
  }
  await queryPostgres(`UPDATE public.platform_email_recovery_requests SET cancelled_at=now() WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL AND cancelled_at IS NULL`,[data.user_id,request.id]);
  await queryPostgres(`INSERT INTO public.audit_log(tenant_id,actor_user_id,entity_type,entity_id,action,details)
   VALUES($1,$2,'user',$3,'login_email_recovery_requested',$4::jsonb)`,[target.tenant_id,context.userId,data.user_id,JSON.stringify({previous_email:data.current_email,replacement_email:data.replacement_email,request_id:request.id})]);
  return {sent:true};
 }

/** Called only with the random token delivered to the new mailbox. The original
 * sign-in remains unchanged until ownership is confirmed. */
export async function confirmSaasEmailRecovery(request:Request):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname!=="/api/security/confirm-login-email")return null;
 const respond=(status:number,message:string)=>new Response(JSON.stringify({message}),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
 if(request.method!=="POST")return respond(405,"Method not allowed");
 try{
  const body=await request.text();
  if(body.length>1024)return respond(413,"Invalid request");
  const payload=JSON.parse(body) as {token?:unknown};
  const token=String(payload?.token||"");
  if(!hexToken.test(token))return respond(400,"Invalid recovery link");
  const db=await getPostgresPool().connect();
  try{
   await db.query("BEGIN");
   const result=await db.query<{id:string;user_id:string;requested_by:string;tenant_id:string|null;previous_email:string;replacement_email:string}>(`
     SELECT id,user_id,requested_by,tenant_id,previous_email,replacement_email FROM public.platform_email_recovery_requests
     WHERE token_hash=$1 AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>now() FOR UPDATE`,[digest(token)]);
   const entry=result.rows[0];
   if(!entry){await db.query("ROLLBACK");return respond(400,"This link has expired or has already been used");}
   const user=await db.query<{email:string;is_saas_admin:boolean}>(`SELECT email,is_saas_admin FROM public.profiles WHERE id=$1`,[entry.user_id]);
   if(!user.rows.length||user.rows[0].email.toLowerCase()!==entry.previous_email||user.rows[0].is_saas_admin){await db.query("ROLLBACK");return respond(409,"This account changed. Ask the administrator to start again");}
   const duplicate=await db.query(`SELECT 1 FROM auth.users WHERE lower(email)=lower($1) AND id<>$2`,[entry.replacement_email,entry.user_id]);
   if(duplicate.rowCount){await db.query("ROLLBACK");return respond(409,"This email is already associated with another account");}
   // Change the actual authentication login only after the new mailbox has
   // demonstrated possession of the one-time secret.
   const {error}=await supabaseAdmin.auth.admin.updateUserById(entry.user_id,{email:entry.replacement_email,email_confirm:true});
   if(error){await db.query("ROLLBACK");return respond(409,"Unable to update login email. Contact support");}
   await db.query(`UPDATE public.profiles SET email=$2 WHERE id=$1`,[entry.user_id,entry.replacement_email]);
   await db.query(`UPDATE public.platform_email_recovery_requests SET consumed_at=now() WHERE id=$1`,[entry.id]);
   await db.query(`UPDATE public.platform_email_recovery_requests SET cancelled_at=now() WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL AND cancelled_at IS NULL`,[entry.user_id,entry.id]);
   await db.query(`INSERT INTO public.audit_log(tenant_id,actor_user_id,entity_type,entity_id,action,details)
    VALUES($1,$2,'user',$3,'login_email_recovery_completed',$4::jsonb)`,[entry.tenant_id,entry.requested_by,entry.user_id,JSON.stringify({previous_email:entry.previous_email,replacement_email:entry.replacement_email,request_id:entry.id})]);
   // Remove existing sessions so the corrected address takes effect on fresh
   // authentication. Preserve MFA factors and the password.
   await db.query(`DELETE FROM auth.sessions WHERE user_id=$1`,[entry.user_id]);
   await db.query("COMMIT");
   return respond(200,"Login email updated. Sign in using your new address and existing password.");
  }catch(error){await db.query("ROLLBACK").catch(()=>{});console.error("[Email recovery] Completion failed",error instanceof Error?error.name:"Unknown error");return respond(503,"Unable to complete recovery. Contact support.");}
  finally{db.release();}
 }catch{return respond(400,"Invalid recovery request")}
}
