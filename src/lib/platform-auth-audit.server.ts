import {createHash} from "node:crypto";
import {queryPostgres} from "@/lib/postgres.server";

// Audit data is always server-derived. Never write password, token, OTP or
// unvalidated client claims to the security record.
export async function recordTenantAuthenticationEvent(
  userId:string,action:string,details:Record<string,string>={}
){
 if(!/^[a-f0-9-]{36}$/i.test(userId)||!/^mfa_[a-z_]{3,32}$/.test(action))return;
 const safeDetails:Record<string,string>={source:"auth_server"};
 if(["email","authenticator","one_tap"].includes(details.method||""))
  safeDetails.method=details.method;
 try{
  await queryPostgres(
   "INSERT INTO public.audit_log(tenant_id,entity_type,entity_id,action,actor_user_id,details) "+
   "SELECT p.tenant_id,'authentication',p.id,$2,p.id,$3::jsonb "+
   "FROM public.profiles p WHERE p.id=$1 AND p.tenant_id IS NOT NULL",
   [userId,action,JSON.stringify(safeDetails)]);
 }catch(error){
  console.error("[Audit] MFA event could not be recorded",error instanceof Error?error.name:"Error");
 }
}

const recentFailed=new Map<string,{time:number,count:number}>();

/**
 * Rejected password attempts are captured by the same-origin auth proxy only
 * after GoTrue rejects them. The identity is a TARGET, never represented as the
 * authenticated actor. Ignore unmatched addresses and don't create an
 * unbounded log stream under automated credential stuffing.
 */
export async function recordRejectedPasswordAttempt(request:Request,body:ArrayBuffer,status:number){
 if(status<400||status>429||body.byteLength>4096)return;
 let email:string;
 try{
  const input=JSON.parse(new TextDecoder().decode(body)) as {email?:unknown};
  if(typeof input.email!=="string")return;
  email=input.email.trim().toLowerCase();
  if(email.length<5||email.length>254||!email.includes("@"))return;
 }catch{return;}
 const key=createHash("sha256").update(email).digest("hex").slice(0,24);
 const now=Date.now();
 if(recentFailed.size>3500){
  for(const [id,value] of recentFailed){if(now-value.time>300000)recentFailed.delete(id);}
 }
 const bucket=recentFailed.get(key);
 if(bucket&&now-bucket.time<300000&&bucket.count>=12)return;
 recentFailed.set(key,{time:bucket&&now-bucket.time<300000?bucket.time:now,count:bucket&&now-bucket.time<300000?bucket.count+1:1});
 const rawIp=request.headers.get("cf-connecting-ip")||request.headers.get("x-real-ip")||"";
 const maskedIp=rawIp.includes(":")?rawIp.split(":").slice(0,3).join(":")+"::":
  /^\d{1,3}(\.\d{1,3}){3}$/.test(rawIp)?rawIp.replace(/\.\d+$/,".0"):"";
 const details={source:"auth_proxy",result:"rejected",...(maskedIp?{ip_network:maskedIp}:{}),
   method:"password",attribution:"attempted_account_not_verified_user"};
 try{
  await queryPostgres(
   "INSERT INTO public.audit_log(tenant_id,entity_type,entity_id,action,actor_user_id,details) "+
   "SELECT p.tenant_id,'authentication',p.id,'login_failed',NULL,$2::jsonb "+
   "FROM public.profiles p WHERE lower(p.email)=$1 AND p.tenant_id IS NOT NULL LIMIT 1",
   [email,JSON.stringify(details)]);
 }catch(error){
  console.error("[Audit] Rejected sign-in attempt was not recorded",error instanceof Error?error.name:"Error");
 }
}
