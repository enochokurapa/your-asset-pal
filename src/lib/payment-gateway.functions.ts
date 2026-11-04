import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const db=supabaseAdmin as any;
const provider=z.enum(["yo","iotec"]);
const environment=z.enum(["sandbox","production"]);
const selector=z.object({provider,environment});
const credentials=z.discriminatedUnion("provider",[
  z.object({provider:z.literal("yo"),environment,username:z.string().min(1).max(150),password:z.string().min(1).max(500)}),
  z.object({provider:z.literal("iotec"),environment,clientId:z.string().min(1).max(200),clientSecret:z.string().min(1).max(500),walletId:z.string().uuid()}),
]);
type Provider=z.infer<typeof provider>;
type Environment=z.infer<typeof environment>;

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
export const listPlatformPaymentGateways=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
   await assertSaasAdmin(context.userId);
   const {data,error}=await db.from("platform_payment_gateways")
      .select("provider,environment,is_enabled,updated_at").order("provider");
   if(error)throw new Error("Unable to load payment gateway configuration");
   return {configured:data??[],encryptionConfigured:/^[a-fA-F0-9]{64}$/.test(process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY?.trim()||"")};
 });
export const savePlatformPaymentGateway=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>credentials.parse(input))
 .handler(async({data,context})=>{
   await assertSaasAdmin(context.userId);
   const {provider:kind,environment:mode,...secrets}=data;
   const {error}=await db.from("platform_payment_gateways").upsert({
     provider:kind,environment:mode,encrypted_credentials:seal(secrets),
     is_enabled:false,updated_at:new Date().toISOString(),updated_by:context.userId
   },{onConflict:"provider,environment"});
   if(error)throw new Error("Unable to save gateway credentials");
   return {saved:true,enabled:false};
 });
export const setPlatformGatewayEnabled=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>selector.extend({enabled:z.boolean()}).parse(input))
 .handler(async({data,context})=>{
   await assertSaasAdmin(context.userId);
   const {data:record,error}=await db.from("platform_payment_gateways").update({
     is_enabled:data.enabled,updated_at:new Date().toISOString(),updated_by:context.userId
   }).eq("provider",data.provider).eq("environment",data.environment).select("provider").maybeSingle();
   if(error||!record)throw new Error("Gateway credentials are missing");
   return {ok:true};
 });

export async function getEnabledGatewayCredentials(kind:Provider,mode:Environment) {
  const {data,error}=await db.from("platform_payment_gateways")
    .select("encrypted_credentials").eq("provider",kind).eq("environment",mode).eq("is_enabled",true).maybeSingle();
  if(error)throw new Error("Unable to load payment gateway configuration");
  return data ? unseal(data.encrypted_credentials) : null;
}
export async function getYoCheckoutConfig() {
  const mode=process.env.YO_API_MODE==="sandbox"?"sandbox":"production";
  const stored=await getEnabledGatewayCredentials("yo",mode);
  if(stored?.username&&stored?.password) return {username:String(stored.username),password:String(stored.password),mode};
  const username=process.env.YO_API_USERNAME||"";
  const password=process.env.YO_API_PASSWORD||"";
  if(!username||!password)throw new Error("Yo Uganda is not configured for checkout");
  return {username,password,mode};
}
export async function isYoCheckoutConfigured() {
  const mode=process.env.YO_API_MODE==="sandbox"?"sandbox":"production";
  const {data,error}=await db.from("platform_payment_gateways").select("provider")
    .eq("provider","yo").eq("environment",mode).eq("is_enabled",true).maybeSingle();
  if(error)throw new Error("Payment configuration unavailable");
  return Boolean(data)||Boolean(process.env.YO_API_USERNAME&&process.env.YO_API_PASSWORD);
}
export const testPlatformGateway=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>selector.parse(input))
 .handler(async({data,context})=>{
   await assertSaasAdmin(context.userId);
   const {data:stored,error}=await db.from("platform_payment_gateways")
     .select("encrypted_credentials").eq("provider",data.provider).eq("environment",data.environment).maybeSingle();
   if(error||!stored)throw new Error("Store credentials before testing");
   const secrets=unseal(stored.encrypted_credentials);
   if(data.provider==="yo") {
     // Do not initiate a live financial transaction simply to test credentials.
     return {ok:false,message:"Yo credentials saved. Verify using a provider-approved sandbox transaction before enabling live collections."};
   }
   const body=new URLSearchParams({
     client_id:String(secrets.clientId),client_secret:String(secrets.clientSecret),grant_type:"client_credentials"
   });
   const response=await fetch("https://id.iotec.io/connect/token",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body,signal:AbortSignal.timeout(10000)
   });
   if(!response.ok) return {ok:false,message:"ioTec authentication was rejected"};
   const result=await response.json() as {access_token?:string};
   return {ok:Boolean(result.access_token),message:result.access_token?
     "ioTec credentials authenticated. Transaction processing is not yet enabled.":
     "No access token returned by ioTec"};
 });
