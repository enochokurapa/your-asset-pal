import {createCipheriv,createDecipheriv,createHash,hkdfSync,randomBytes} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {queryPostgres} from "@/lib/postgres.server";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {classifyReferrer,isAIReferral,type AcquisitionChannel} from "@/lib/acquisition-channels";

type Provider="google_search_console"|"cloudflare_web_analytics";
type IntegrationRow={provider:Provider;config:Record<string,unknown>;encrypted_token:string|null;updated_at:string};
type SearchRow={keys:string[];clicks:number;impressions:number;ctr:number;position:number};
type SearchResult={rows?:SearchRow[]};
type CloudflareRow={count:number;sum:{visits:number};dimensions?:{metric?:string}};
const oauthRedirect="https://assetflow360.com/saas-admin/traffic";
const searchedSite="assetflow360.com";
const scope="https://www.googleapis.com/auth/webmasters.readonly";

function encryptionKey():Buffer{
  const key=process.env.SMTP_SETTINGS_ENCRYPTION_KEY?.trim()||"";
  if(!/^[0-9a-fA-F]{64}$/.test(key))throw new Error("Server encryption key is not configured");
  return Buffer.from(hkdfSync("sha256",Buffer.from(key,"hex"),Buffer.alloc(0),"assetflow-acquisition-analytics-v1",32));
}
function encrypt(value:string):string{
  const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const encrypted=Buffer.concat([c.update(value,"utf8"),c.final()]);
  return ["v1",iv.toString("base64url"),c.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decrypt(value:string):string{
  const [version,iv,tag,ciphertext]=value.split(".");
  if(version!=="v1"||!iv||!tag||!ciphertext)throw Error("Unsupported encrypted connection");
  const d=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
  d.setAuthTag(Buffer.from(tag,"base64url"));
  return Buffer.concat([d.update(Buffer.from(ciphertext,"base64url")),d.final()]).toString("utf8");
}
async function assertAdmin(userId:string){
 const [row]=await queryPostgres<{id:string}>("SELECT id FROM public.profiles WHERE id=$1 AND is_active=TRUE AND is_saas_admin=TRUE LIMIT 1",[userId]);
 if(!row)throw Error("SaaS administrator permissions required");
}
async function config(provider:Provider):Promise<IntegrationRow|null>{
 const [row]=await queryPostgres<IntegrationRow>(
   "SELECT provider,config,encrypted_token,updated_at FROM public.platform_acquisition_integrations WHERE provider=$1 LIMIT 1",[provider]);
 return row||null;
}
async function jsonRequest<T>(url:string,init:RequestInit):Promise<T>{
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(12_000),redirect:"error"});
 const raw=await response.text();
 if(!response.ok)throw Error("External analytics provider rejected the request (HTTP "+response.status+"). Verify its permissions and configuration.");
 try{return JSON.parse(raw) as T}catch{throw Error("Analytics provider returned an invalid response")}
}
function credentials(){
 const id=process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID?.trim()||"";
 const secret=process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET?.trim()||"";
 if(!id||!secret)throw Error("Google Search Console OAuth client ID and secret must be configured securely on the server");
 return {id,secret};
}
function hashState(value:string){return createHash("sha256").update(value).digest("hex")}
function belongsToSite(site:string){
 const allowed=new Set(["sc-domain:assetflow360.com","https://assetflow360.com/","https://www.assetflow360.com/"]);
 return allowed.has(site);
}
export const getAcquisitionConnections=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
   await assertAdmin(context.userId);
   const rows=await queryPostgres<IntegrationRow>(
     "SELECT provider,config,updated_at,encrypted_token FROM public.platform_acquisition_integrations");
   const g=rows.find(row=>row.provider==="google_search_console");
   const c=rows.find(row=>row.provider==="cloudflare_web_analytics");
   return {
     google:{connected:Boolean(g?.encrypted_token),site:String(g?.config?.site||""),
       oauthReady:Boolean(process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID&&process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET),
       updatedAt:g?.updated_at||null},
     cloudflare:{connected:Boolean(c?.encrypted_token),accountId:String(c?.config?.accountId||""),
       siteTag:String(c?.config?.siteTag||""),updatedAt:c?.updated_at||null},
   };
 });
export const startSearchConsoleOAuth=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
   await assertAdmin(context.userId);
   const {id}=credentials();
   const state=randomBytes(32).toString("base64url");
   await queryPostgres("DELETE FROM public.platform_search_oauth_states WHERE expires_at<NOW()");
   await queryPostgres(`INSERT INTO public.platform_search_oauth_states(state_hash,admin_user_id,expires_at)
      VALUES($1,$2,NOW()+INTERVAL '10 minutes')`,[hashState(state),context.userId]);
   const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
   for(const [key,value] of Object.entries({client_id:id,redirect_uri:oauthRedirect,response_type:"code",
      scope,access_type:"offline",prompt:"consent",state})){url.searchParams.set(key,value)}
   return {url:url.toString()};
 });
async function listSearchConsoleSites(accessToken:string){
 return jsonRequest<{siteEntry?:{siteUrl:string;permissionLevel:string}[]}>(
  "https://www.googleapis.com/webmasters/v3/sites",{
    headers:{Authorization:"Bearer "+accessToken},
  });
}
function matchingSite(rows:{siteUrl:string;permissionLevel:string}[]=[]){
 return rows.find(r=>belongsToSite(r.siteUrl)&&r.permissionLevel!=="siteUnverifiedUser")?.siteUrl||"";
}
export const completeSearchConsoleOAuth=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({code:z.string().min(5).max(2500),state:z.string().min(20).max(100)}).parse(input))
 .handler(async({context,data})=>{
   await assertAdmin(context.userId);
   const [validated]=await queryPostgres<{state_hash:string}>(`
      DELETE FROM public.platform_search_oauth_states WHERE state_hash=$1
      AND admin_user_id=$2 AND expires_at>NOW() RETURNING state_hash`,
     [hashState(data.state),context.userId]);
   if(!validated)throw Error("Google authorisation expired or could not be verified. Start again.");
   const {id,secret}=credentials();
   const tokens=await jsonRequest<{refresh_token?:string;access_token?:string}>(
     "https://oauth2.googleapis.com/token",{
       method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
       body:new URLSearchParams({code:data.code,client_id:id,client_secret:secret,
         redirect_uri:oauthRedirect,grant_type:"authorization_code"}).toString(),
     });
   if(!tokens.refresh_token||!tokens.access_token)throw Error("Google did not provide offline read-only permission. Reconnect and approve access.");
   const sites=await listSearchConsoleSites(tokens.access_token);
   const site=matchingSite(sites.siteEntry);
   await queryPostgres(`INSERT INTO public.platform_acquisition_integrations(provider,config,encrypted_token,updated_by,updated_at)
      VALUES('google_search_console',$1,$2,$3,NOW())
      ON CONFLICT(provider) DO UPDATE SET config=EXCLUDED.config,
      encrypted_token=EXCLUDED.encrypted_token,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [JSON.stringify({site}),encrypt(tokens.refresh_token),context.userId]);
   return {connected:true,site};
 });
export const disconnectSearchConsole=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  await assertAdmin(context.userId);
  await queryPostgres("DELETE FROM public.platform_acquisition_integrations WHERE provider='google_search_console'");
  return {disconnected:true};
 });
export const saveCloudflareAcquisition=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({
   accountId:z.string().regex(/^[a-fA-F0-9]{32}$/,"Enter your 32-character Cloudflare account ID"),
   siteTag:z.string().regex(/^[a-fA-F0-9-]{20,70}$/,"Enter the Cloudflare Web Analytics site tag"),
   apiToken:z.string().max(500).optional().default(""),
 }).parse(input))
 .handler(async({context,data})=>{
   await assertAdmin(context.userId);
   const prior=await config("cloudflare_web_analytics");
   if(!data.apiToken&&!prior?.encrypted_token)throw Error("A Cloudflare API token with Account Analytics Read is required");
   const token=data.apiToken?encrypt(data.apiToken):prior!.encrypted_token;
   await queryPostgres(`INSERT INTO public.platform_acquisition_integrations(provider,config,encrypted_token,updated_by,updated_at)
      VALUES('cloudflare_web_analytics',$1,$2,$3,NOW())
      ON CONFLICT(provider) DO UPDATE SET config=EXCLUDED.config,
      encrypted_token=EXCLUDED.encrypted_token,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
     [JSON.stringify({accountId:data.accountId,siteTag:data.siteTag}),token,context.userId]);
   return {saved:true};
 });
export const disconnectCloudflareAcquisition=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
   await assertAdmin(context.userId);
   await queryPostgres("DELETE FROM public.platform_acquisition_integrations WHERE provider='cloudflare_web_analytics'");
   return {disconnected:true};
 });
async function googleAccessToken(refreshToken:string){
 const {id,secret}=credentials();
 const result=await jsonRequest<{access_token?:string}>("https://oauth2.googleapis.com/token",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({refresh_token:refreshToken,client_id:id,client_secret:secret,grant_type:"refresh_token"}).toString(),
 });
 if(!result.access_token)throw Error("Search Console session requires reconnection");
 return result.access_token;
}
async function searchConsoleReport(token:string,site:string,dimensions:string[],startDate:string,endDate:string){
 const response=await jsonRequest<SearchResult>(
   "https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(site)+"/searchAnalytics/query",{
     method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
     body:JSON.stringify({startDate,endDate,dimensions,type:"web",rowLimit:35,dataState:"final"}),
   });
 return (response.rows||[]).map(row=>({
   label:String(row.keys?.[0]||""),clicks:Number(row.clicks||0),
   impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),
   position:Number(row.position||0),
 }));
}
type SearchInsight={label:string;clicks:number;impressions:number;ctr:number;position:number};
type CloudflareInsight={label:string;views:number;visits:number};
type AcquisitionReport={
  google:{state:"disconnected"|"ready"|"error"|"property_missing";property:string;error?:string;
    total:SearchInsight|null;queries:SearchInsight[];pages:SearchInsight[];countries:SearchInsight[];devices:SearchInsight[]};
  cloudflare:{state:"disconnected"|"ready"|"error";error?:string;total:{views:number;visits:number}|null;
    referrers:CloudflareInsight[];pages:CloudflareInsight[];countries:CloudflareInsight[];aiReferrers:CloudflareInsight[];channels:{label:AcquisitionChannel;views:number;visits:number}[]};
  period:{start:string;end:string};
};
const reportCache=new Map<string,{expires:number;promise:Promise<AcquisitionReport>}>();
export const getAcquisitionReport=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context}):Promise<AcquisitionReport>=>{
  await assertAdmin(context.userId);
  const now=new Date(),end=new Date(now.getTime()-3*86400000),start=new Date(end.getTime()-29*86400000);
  const day=(d:Date)=>d.toISOString().slice(0,10);
  const key=day(now);
  const existing=reportCache.get(key);
  if(existing && existing.expires>Date.now())return existing.promise;
  const promise=loadAcquisition(day(start),day(end));
  reportCache.set(key,{promise,expires:Date.now()+5*60_000});
  if(reportCache.size>4){const first=reportCache.keys().next().value;if(first)reportCache.delete(first)}
  return promise;
 });
async function loadAcquisition(start:string,end:string):Promise<AcquisitionReport>{
 const [g,c]=await Promise.all([config("google_search_console"),config("cloudflare_web_analytics")]);
 const report:AcquisitionReport={
  period:{start,end},
  google:{state:"disconnected",property:String(g?.config?.site||""),total:null,queries:[],pages:[],countries:[],devices:[]},
  cloudflare:{state:"disconnected",total:null,referrers:[],pages:[],countries:[],aiReferrers:[],channels:[]},
 };
 await Promise.all([
  (async()=>{
   if(!g?.encrypted_token)return;
   let site=String(g.config?.site||"");
   try{
    const token=await googleAccessToken(decrypt(g.encrypted_token));
    if(!site){
     const available=await listSearchConsoleSites(token);
     site=matchingSite(available.siteEntry);
     if(!site){report.google.state="property_missing";return;}
     await queryPostgres(`UPDATE public.platform_acquisition_integrations
       SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{site}',to_jsonb($1::text)),updated_at=NOW()
       WHERE provider='google_search_console'`,[site]);
    }
    report.google.property=site;
    const [totals,queries,pages,countries,devices]=await Promise.all([
      searchConsoleReport(token,site,[],start,end),
      searchConsoleReport(token,site,["query"],start,end),
      searchConsoleReport(token,site,["page"],start,end),
      searchConsoleReport(token,site,["country"],start,end),
      searchConsoleReport(token,site,["device"],start,end),
    ]);
    report.google={state:"ready",property:site,total:totals[0]||null,queries,pages,countries,devices};
   }catch(err){report.google.state="error";report.google.error=err instanceof Error?err.message:"Search Console unavailable"}
  })(),
  (async()=>{
   if(!c?.encrypted_token)return;
   const accountId=String(c.config?.accountId||""),siteTag=String(c.config?.siteTag||"");
   if(!/^[a-fA-F0-9]{32}$/.test(accountId)||!/^[a-fA-F0-9-]{20,70}$/.test(siteTag)){
    report.cloudflare.state="error";report.cloudflare.error="Cloudflare account and Web Analytics site IDs are invalid";return;
   }
   const after=start+"T00:00:00Z",before=new Date(new Date(end+"T00:00:00Z").getTime()+86400000).toISOString();
   const filter=`{datetime_geq:"${after}",datetime_lt:"${before}",siteTag:"${siteTag}"}`;
   const groups=(alias:string,field?:string,limit=100)=>`${alias}:rumPageloadEventsAdaptiveGroups(filter:${filter},limit:${limit},orderBy:[count_DESC]){count sum{visits} ${field?"dimensions{metric:"+field+"}":""}}`;
   const query=`{viewer{accounts(filter:{accountTag:"${accountId}"}){${groups("total",undefined,1)} ${groups("referrers","refererHost")} ${groups("pages","requestPath")} ${groups("countries","countryName")}}}}`;
   try{
    const response=await jsonRequest<{errors?:{message:string}[];data?:{viewer?:{accounts?:{
      total:CloudflareRow[];referrers:CloudflareRow[];pages:CloudflareRow[];countries:CloudflareRow[];
    }[]}}}>("https://api.cloudflare.com/client/v4/graphql",{
      method:"POST",headers:{Authorization:"Bearer "+decrypt(c.encrypted_token),"Content-Type":"application/json"},
      body:JSON.stringify({query}),
    });
    if(response.errors?.length)throw Error("Cloudflare denied the analytics query. Check the token permission and Web Analytics site tag.");
    const data=response.data?.viewer?.accounts?.[0];
    if(!data)throw Error("Cloudflare account is not accessible with this token");
    const mapped=(rows:CloudflareRow[]=[])=>rows.map(r=>({
      label:r.dimensions?.metric||"(direct / unknown)",views:Number(r.count||0),visits:Number(r.sum?.visits||0),
    }));
    const referrers=mapped(data.referrers);
    const grouped=new Map<AcquisitionChannel,{views:number;visits:number}>();
    for(const ref of referrers){
      const category=classifyReferrer(ref.label);
      const existing=grouped.get(category)||{views:0,visits:0};
      existing.views+=ref.views;existing.visits+=ref.visits;grouped.set(category,existing);
    }
    const channels=[...grouped.entries()].map(([label,values])=>({label,...values}))
      .sort((a,b)=>b.visits-a.visits);
    report.cloudflare={state:"ready",
      total:{views:Number(data.total?.[0]?.count||0),visits:Number(data.total?.[0]?.sum?.visits||0)},
      referrers,pages:mapped(data.pages),countries:mapped(data.countries),
      aiReferrers:referrers.filter(r=>isAIReferral(r.label)),channels,
    };
   }catch(err){report.cloudflare.state="error";report.cloudflare.error=err instanceof Error?err.message:"Cloudflare unavailable"}
  })(),
 ]);
 return report;
}
