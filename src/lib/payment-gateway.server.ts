import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const db=supabaseAdmin as any;
type Provider="yo"|"iotec";
type Mode="sandbox"|"production";
function encryptionKey() {
  // Never derive encryption keys from the payment provider secret or Supabase service-role key.
  const source=process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY?.trim()||"";
  if (!/^[a-fA-F0-9]{64}$/.test(source))
    throw new Error("PAYMENT_GATEWAY_ENCRYPTION_KEY must be configured as 32 random bytes in hex.");
  return Buffer.from(source,"hex");
}
function seal(value:object) {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
function unseal(payload:string):any {
  const [version,nonce,tag,ciphertext]=payload.split(".");
  if(version!=="v1"||!nonce||!tag||!ciphertext)throw new Error("Unrecognized gateway encryption format");
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(nonce,"base64url"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64url")),decipher.final()]).toString("utf8"));
}
async function assertSaasAdmin(userId:string) {
  const {data,error}=await db.from("profiles").select("is_saas_admin,is_active").eq("id",userId).single();
  if(error||data?.is_saas_admin!==true||data?.is_active!==true)throw new Error("Active SaaS administrator account required");
}

export async function listStatus(userId:string){
  await assertSaasAdmin(userId);
  const {data,error}=await db.from("platform_payment_gateways").select("provider,environment,is_enabled,updated_at").order("provider");
  if(error)throw new Error("Unable to load gateway settings");
  return {configured:data??[],encryptionConfigured:/^[a-fA-F0-9]{64}$/.test(process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY?.trim()||"")};
}
export async function storeGateway(userId:string,values: any){
  await assertSaasAdmin(userId);
  const {provider,environment,...secrets}=values;
  const {error}=await db.from("platform_payment_gateways").upsert({
    provider,environment,encrypted_credentials:seal(secrets),
    is_enabled:false,updated_at:new Date().toISOString(),updated_by:userId
  },{onConflict:"provider,environment"});
  if(error)throw new Error("Unable to save credentials");
  return {saved:true,enabled:false};
}
export async function switchGateway(userId:string,values:{provider:Provider;environment:Mode;enabled:boolean}){
  await assertSaasAdmin(userId);
  if(values.enabled){
    const {error}=await db.from("platform_payment_gateways").update({is_enabled:false})
      .eq("provider",values.provider).neq("environment",values.environment);
    if(error)throw new Error("Unable to select gateway environment");
  }
  const {data,error}=await db.from("platform_payment_gateways").update({
    is_enabled:values.enabled,updated_at:new Date().toISOString(),updated_by:userId
  }).eq("provider",values.provider).eq("environment",values.environment).select("provider").maybeSingle();
  if(error||!data)throw new Error("Gateway credentials not found");
  return {ok:true};
}
export async function getEnabledGatewayCredentials(kind:Provider,mode:Environment) {
  const {data,error}=await db.from("platform_payment_gateways")
    .select("encrypted_credentials").eq("provider",kind).eq("environment",mode).eq("is_enabled",true).maybeSingle();
  if(error)throw new Error("Unable to load payment gateway configuration");
  return data ? unseal(data.encrypted_credentials) : null;
}
export async function getYoCheckoutConfig() {
  const {data,error}=await db.from("platform_payment_gateways")
    .select("environment,encrypted_credentials")
    .eq("provider","yo").eq("is_enabled",true).maybeSingle();
  if(error)throw new Error("Unable to load Yo Uganda gateway settings");
  if(data) {
    const secrets=unseal(data.encrypted_credentials);
    if(!secrets.username||!secrets.password) throw new Error("Yo Uganda credentials are incomplete");
    return {username:String(secrets.username),password:String(secrets.password),mode:data.environment as Environment};
  }
  const mode:Environment=process.env.YO_API_MODE==="sandbox"?"sandbox":"production";
  const username=process.env.YO_API_USERNAME||"";
  const password=process.env.YO_API_PASSWORD||"";
  if(!username||!password)throw new Error("Yo Uganda is not configured for checkout");
  return {username,password,mode};
}
export async function isYoCheckoutConfigured() {
  const {data,error}=await db.from("platform_payment_gateways").select("provider")
    .eq("provider","yo").eq("is_enabled",true).limit(1);
  if(error) return Boolean(process.env.YO_API_USERNAME&&process.env.YO_API_PASSWORD);
  return Boolean(data?.length)||Boolean(process.env.YO_API_USERNAME&&process.env.YO_API_PASSWORD);
}

export async function checkGateway(userId:string,values:{provider:Provider;environment:Mode}){
  await assertSaasAdmin(userId);
  const {data,error}=await db.from("platform_payment_gateways").select("encrypted_credentials")
    .eq("provider",values.provider).eq("environment",values.environment).maybeSingle();
  if(error||!data)throw new Error("Store credentials before testing");
  const secrets=unseal(data.encrypted_credentials);
  if(values.provider==="yo")return {ok:false,message:"Yo credentials saved; a provider-approved sandbox transaction is required."};
  const body=new URLSearchParams({client_id:String(secrets.clientId),client_secret:String(secrets.clientSecret),grant_type:"client_credentials"});
  const response=await fetch("https://id.iotec.io/connect/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body,signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)return {ok:false,message:"ioTec OAuth authentication rejected"};
  const result=await response.json() as {access_token?:string};
  return {ok:Boolean(result.access_token),message:result.access_token?
    "ioTec credentials authenticated; transaction adapter not yet enabled.":"No ioTec access token returned"};
}
