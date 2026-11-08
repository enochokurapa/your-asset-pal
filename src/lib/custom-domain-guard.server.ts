import {supabaseAdmin} from "@/integrations/supabase/client.server";

/** Tenant custom-domain boundary: verified, active domain -> precisely one tenant.
 * Do not trust an unauthenticated client-supplied tenant id or allow the main
 * platform's generic registration and login sessions on a customer's domain. */
const PLATFORM_HOSTS=new Set(["assetflow360.com","www.assetflow360.com","localhost","127.0.0.1"]);
const authBase=()=>process.env.SUPABASE_AUTH_INTERNAL_URL?.trim().replace(/\/$/,"");
type DomainRecord={tenant_id:string;hostname:string;status:string};
const knownDomains=new Map<string,{expires:number;tenant:string|null}>();
const admin=supabaseAdmin as any;
const deny=(status:number,message:string)=>new Response(JSON.stringify({error:"domain_access_denied",message}),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const normalizedHost=(url:URL)=>url.hostname.toLowerCase().replace(/\.$/,"");
export async function domainTenantFor(request:Request):Promise<string|null>{
 const hostname=normalizedHost(new URL(request.url));
 if(PLATFORM_HOSTS.has(hostname))return null;
 const cached=knownDomains.get(hostname);
 if(cached&&cached.expires>Date.now())return cached.tenant;
 const {data,error}=await admin.from("custom_domains").select("tenant_id,status").eq("hostname",hostname).in("status",["active","verified"]).maybeSingle();
 if(error)throw Error("Custom-domain lookup unavailable");
 const tenant=data?.tenant_id??null;
 knownDomains.set(hostname,{expires:Date.now()+15000,tenant});
 return tenant;
}
async function authorizedTenant(token:string):Promise<string|null>{
 const upstream=authBase();
 if(!upstream)throw Error("Authentication verification unavailable");
 const verified=await fetch(`${upstream}/user`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
 if(!verified.ok)return null;
 const user=await verified.json() as {id?:string};
 if(!user.id)return null;
 const {data,error}=await admin.from("profiles").select("tenant_id,is_active,is_saas_admin").eq("id",user.id).maybeSingle();
 if(error)throw Error("Workspace verification unavailable");
 return data?.is_active!==false&&!data?.is_saas_admin?data?.tenant_id??null:null;
}
export async function domainGuard(request:Request):Promise<Response|null>{
 const url=new URL(request.url);
 const host=normalizedHost(url);
 if(PLATFORM_HOSTS.has(host))return null;
 const tenant=await domainTenantFor(request);
 if(!tenant)return deny(404,"This custom domain is not active for any AssetFlow360 workspace.");
 const path=url.pathname;
 if(path==="/"&&request.method==="GET")return Response.redirect(new URL("/login",url),302);
 // Registration, platform control and recovery aren't cross-tenant operations.
 if(/^\/(register|saas-admin)(?:\/|$)/.test(path))return deny(403,"Use the main AssetFlow360 website for this operation.");
 // OAuth links can return tokens via fragments; until callback binding is
 // enforced, custom domains accept password MFA only.
 if(/^\/auth\/v1\/(authorize|callback|verify|signup|invite|recover|otp|magiclink)(?:\/|$)/.test(path))return deny(403,"This authentication action is available only on the main AssetFlow360 website.");
 const authorization=request.headers.get("authorization")||request.headers.get("x-supabase-auth")||"";
 const bearer=authorization.match(/^Bearer\s+(.+)$/i)?.[1];
 if(bearer&&bearer.split(".").length===3){
  // Published anonymous PostgREST token is not a user session. An authenticated
  // JWT must have a verified user and belong to this custom hostname.
  let anonymous=false;
  try{const payload=JSON.parse(Buffer.from(bearer.split(".")[1],"base64url").toString("utf8"));anonymous=payload?.role==="anon"&&!payload?.sub;}catch{}
  if(anonymous)return null;
  const actual=await authorizedTenant(bearer);
  if(actual!==tenant)return deny(403,"This account does not belong to the organisation connected to this domain.");
 }
 return null;
}
export async function protectDomainLoginResponse(request:Request,response:Response):Promise<Response>{
 const url=new URL(request.url);
 if(PLATFORM_HOSTS.has(normalizedHost(url)))return response;
 if(!url.pathname.startsWith("/auth/v1/token")||!response.ok)return response;
 const tenant=await domainTenantFor(request);
 if(!tenant)return deny(403,"Custom domain unavailable");
 // Explicitly confirm the newly issued token belongs to this hostname's tenant.
 // Never return cross-tenant session credentials to the browser.
 const body=await response.clone().json().catch(()=>null) as {access_token?:string}|null;
 if(!body?.access_token)return deny(502,"Unable to verify workspace sign-in");
 const actual=await authorizedTenant(body.access_token);
 if(actual!==tenant)return deny(403,"This email belongs to a different organisation. Sign in through its own domain or the main AssetFlow360 website.");
 return response;
}
