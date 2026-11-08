import {randomInt,randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import {getPostgresPool,queryPostgres} from "@/lib/postgres.server";
import {sendPlatformSecurityCodeEmail} from "@/lib/platform-smtp.server";

type JwtPayload={sub?:string;session_id?:string;aal?:string;exp?:number};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const G=<T>(x:T)=>x;
function jwtPayload(token:string):JwtPayload{
 try{return JSON.parse(Buffer.from(token.split(".")[1]||"","base64url").toString("utf8")) as JwtPayload;}
 catch{throw new Response("Invalid authentication token",{status:401})}
}
async function adminIdentity(id:string){
 const rows=await queryPostgres<{email:string;is_active:boolean;is_saas_admin:boolean;tenant_role:string;admin_role:boolean}>(
 `SELECT p.email,p.is_active,p.is_saas_admin,p.tenant_role,
  EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin') AS admin_role
  FROM public.profiles p WHERE p.id=$1`,[id]);
 const p=rows[0];
 return {admin:Boolean(p?.is_saas_admin||p?.tenant_role==="tenant_admin"||p?.admin_role),active:p?.is_active===true,email:p?.email||""};
}
export async function getEmailMfaProof(userId:string,sessionId:string){
 if(!UUID.test(userId)||!UUID.test(sessionId))return false;
 const result=await queryPostgres<{ok:boolean}>(`SELECT EXISTS(
 SELECT 1 FROM public.platform_security_email_mfa
 WHERE user_id=$1 AND session_id=$2 AND verified_at IS NOT NULL
 ) AS ok`,[userId,sessionId]);
 return result[0]?.ok===true;
}
export async function shouldRequireEmailMfa(token:string){
 const jwt=jwtPayload(token);
 if(!jwt.sub||!UUID.test(jwt.sub))return false;
 const who=await adminIdentity(jwt.sub);
 if(!who.active)return false;
 if(!who.admin){
  const factors=await queryPostgres<{enrolled:boolean}>(`SELECT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=$1 AND factor_type='totp' AND status='verified') AS enrolled`,[jwt.sub]);
  return factors[0]?.enrolled===true&&jwt.aal!=="aal2";
 }
 if(jwt.aal==="aal2")return false;
 return !(jwt.session_id&&await getEmailMfaProof(jwt.sub,jwt.session_id));
}
async function authorized(request:Request){
 const auth=request.headers.get("authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 const jwt=jwtPayload(token);
 if(!jwt.sub||!UUID.test(jwt.sub)||!jwt.session_id||!UUID.test(jwt.session_id))throw new Response("Invalid sign-in session",{status:401});
 const base=process.env.SUPABASE_AUTH_INTERNAL_URL?.trim();
 if(!base)throw new Response("Authentication service unavailable",{status:503});
 const resp=await fetch(base.replace(/\/$/,"")+"/user",{headers:{Authorization:"Bearer "+token,apikey:process.env.SUPABASE_PUBLISHABLE_KEY||""},signal:AbortSignal.timeout(10000)});
 if(!resp.ok)throw new Response("Sign in again",{status:401});
 const u=await resp.json() as {id?:string;email?:string;email_confirmed_at?:string|null};
 if(u.id!==jwt.sub)throw new Response("Invalid identity",{status:401});
 const who=await adminIdentity(u.id);
 if(!who.active)throw new Response("Account inactive",{status:403});
 const email=String(u.email||"").toLowerCase();
 if(who.email?.toLowerCase()!==email)throw new Response("Registered email mismatch",{status:403});
 return {userId:u.id,sessionId:jwt.session_id,admin:who.admin,confirmed:!!u.email_confirmed_at,email,aal:jwt.aal||""};
}
const errorJson=(status:number,message:string)=>new Response(JSON.stringify({error:message}),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const okJson=(body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}});
function hashCode(code:string,salt:string){
 const secret=process.env.SMTP_SETTINGS_ENCRYPTION_KEY?.trim();
 if(!secret||!/^[a-f0-9]{64}$/i.test(secret))throw new Response("Security service unavailable",{status:503});
 return createHmac("sha256",Buffer.from(secret,"hex")).update(salt+":"+code).digest("hex");
}
export async function maybeHandleEmailMfa(request:Request):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith("/api/security/email-mfa/"))return null;
 if(request.method!=="POST")return errorJson(405,"Method not allowed");
 try{
  const who=await authorized(request);
  const action=url.pathname.split("/").at(-1);
  if(!who.admin){
    if(action==="status")return okJson({required:false,verified:!(await shouldRequireEmailMfa(request.headers.get("authorization")!.slice(7)))});
    return errorJson(403,"Administrator account required");
  }
  if(action==="status")return okJson({required:true,verified:who.aal==="aal2"||await getEmailMfaProof(who.userId,who.sessionId),emailAvailable:who.confirmed});
  if(who.aal==="aal2")return okJson({verified:true});
  if(action==="send"){
   if(!who.confirmed)return errorJson(403,"Verify your registered email address before using email codes");
   if(await getEmailMfaProof(who.userId,who.sessionId))return okJson({verified:true});
   const code=String(randomInt(0,1000000)).padStart(6,"0");
   const salt=randomBytes(18).toString("hex");const value=salt+":"+hashCode(code,salt);
   const db=getPostgresPool();
   const response=await db.query<{user_id:string}>(`
    INSERT INTO public.platform_security_email_mfa(user_id,session_id,code_hash,code_expires_at,last_sent_at,sends_in_window,window_started_at,failed_attempts)
    VALUES($1,$2,$3,now()+interval '10 minutes',now(),1,now(),0)
    ON CONFLICT(user_id,session_id) DO UPDATE SET
     code_hash=EXCLUDED.code_hash,code_expires_at=EXCLUDED.code_expires_at,last_sent_at=now(),failed_attempts=0,
     sends_in_window=CASE WHEN platform_security_email_mfa.window_started_at<now()-interval '1 hour' THEN 1 ELSE platform_security_email_mfa.sends_in_window+1 END,
     window_started_at=CASE WHEN platform_security_email_mfa.window_started_at<now()-interval '1 hour' THEN now() ELSE platform_security_email_mfa.window_started_at END
    WHERE platform_security_email_mfa.verified_at IS NULL
      AND (platform_security_email_mfa.last_sent_at IS NULL OR platform_security_email_mfa.last_sent_at < now()-interval '60 seconds')
      AND (platform_security_email_mfa.window_started_at<now()-interval '1 hour' OR platform_security_email_mfa.sends_in_window<5)
    RETURNING user_id`,[who.userId,who.sessionId,value]);
   if(!response.rows.length)return errorJson(429,"Please wait before requesting another code");
   try{await sendPlatformSecurityCodeEmail(who.email,code)}catch(e){
    await db.query(`DELETE FROM public.platform_security_email_mfa WHERE user_id=$1 AND session_id=$2 AND code_hash=$3 AND verified_at IS NULL`,[who.userId,who.sessionId,value]);
    console.error("[Security email] SMTP delivery rejected",e instanceof Error?e.message:"Unknown error");
    return errorJson(503,"Security email could not be sent. Try again or use your authenticator.");
   }
   return okJson({sent:true});
  }
  if(action==="verify"){
   const payload=await request.json().catch(()=>({})) as {code?:unknown};
   const code=String(payload.code||"");
   if(!/^\d{6}$/.test(code))return errorJson(400,"Enter the six-digit code");
   const client=getPostgresPool();const db=await client.connect();
   try{
    await db.query("BEGIN");
    const row=await db.query<{code_hash:string;failed_attempts:number}>(`
      SELECT code_hash,failed_attempts FROM public.platform_security_email_mfa
      WHERE user_id=$1 AND session_id=$2 AND verified_at IS NULL AND code_expires_at>now() FOR UPDATE`,[who.userId,who.sessionId]);
    if(!row.rows.length||row.rows[0].failed_attempts>=5){await db.query("COMMIT");return errorJson(400,"Code expired or unavailable. Request a new code.");}
    const [salt,expected]=String(row.rows[0].code_hash||"").split(":");
    const given=hashCode(code,salt);
    const valid=expected?.length===given.length&&timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(given,"hex"));
    if(valid){await db.query(`UPDATE public.platform_security_email_mfa SET verified_at=now(),code_hash=NULL,code_expires_at=NULL WHERE user_id=$1 AND session_id=$2`,[who.userId,who.sessionId]);}
    else{await db.query(`UPDATE public.platform_security_email_mfa SET failed_attempts=failed_attempts+1 WHERE user_id=$1 AND session_id=$2`,[who.userId,who.sessionId]);}
    await db.query("COMMIT");
    return valid?okJson({verified:true}):errorJson(400,"Incorrect code");
   }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e}
   finally{db.release()}
  }
  return errorJson(404,"Not found");
 }catch(e){
  if(e instanceof Response)return errorJson(e.status,(await e.text())||"Authentication required");
  console.error("[Security email] Verification service unavailable",e instanceof Error?e.message:"Unknown error");
  return errorJson(503,"Verification service temporarily unavailable");
 }
}
