import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import * as net from "node:net";
import * as tls from "node:tls";
import { lookup } from "node:dns/promises";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db=supabaseAdmin as any;
export type MailCategory="security"|"operations"|"finance";
export type SmtpConfig={
 host:string;port:465|587;username:string;password:string;fromEmail:string;
};
function key(){
 const value=process.env.SMTP_SETTINGS_ENCRYPTION_KEY?.trim()||"";
 if(!/^[0-9a-fA-F]{64}$/.test(value))throw new Error("SMTP_SETTINGS_ENCRYPTION_KEY is not configured");
 return Buffer.from(value,"hex");
}
function encrypt(config:SmtpConfig){
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key(),iv);
 const ct=Buffer.concat([cipher.update(JSON.stringify(config),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),ct.toString("base64url")].join(".");
}
function decrypt(value:string):SmtpConfig{
 const [v,iv,tag,ct]=value.split(".");
 if(v!=="v1"||!iv||!tag||!ct)throw new Error("SMTP configuration has an unsupported format");
 const d=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));
 d.setAuthTag(Buffer.from(tag,"base64url"));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(ct,"base64url")),d.final()]).toString("utf8")) as SmtpConfig;
}
async function assertAdmin(userId:string){
 const {data,error}=await db.from("profiles").select("is_active,is_saas_admin").eq("id",userId).single();
 if(error||data?.is_active!==true||data?.is_saas_admin!==true)throw new Error("Active SaaS administrator required");
}
async function readConfig():Promise<SmtpConfig|null>{
 const {data,error}=await db.from("platform_smtp_settings").select("encrypted_config").eq("id",true).maybeSingle();
 if(error)throw new Error("SMTP settings unavailable. Apply the database migration.");
 return data?decrypt(data.encrypted_config):null;
}
export async function smtpStatus(userId:string){
 await assertAdmin(userId);
 const {data,error}=await db.from("platform_smtp_settings").select("updated_at").eq("id",true).maybeSingle();
 if(error)throw new Error("SMTP settings table unavailable");
 const config= data ? await readConfig() : null;
 return {configured:Boolean(config),encryptionReady:/^[0-9a-fA-F]{64}$/.test(process.env.SMTP_SETTINGS_ENCRYPTION_KEY||""),
   host:config?.host||"",port:config?.port||587,username:config?.username||"",fromEmail:config?.fromEmail||"no-reply@assetflow360.com",
   updatedAt:data?.updated_at||null,passwordSet:Boolean(config?.password),
   authServiceConfigured:Boolean(process.env.GOTRUE_SMTP_HOST&&process.env.GOTRUE_SMTP_USER)};
}
export async function saveSmtp(userId:string,config:SmtpConfig){
 await assertAdmin(userId);
 const existing=await readConfig();
 const clean:{[K in keyof SmtpConfig]:SmtpConfig[K]}={
  host:config.host.trim().toLowerCase(),port:config.port,username:config.username.trim(),
  password:config.password||existing?.password||"",fromEmail:config.fromEmail.trim().toLowerCase()
 };
 if(!clean.password)throw new Error("Enter an SMTP password");
 if(!/^[a-z0-9.-]+$/.test(clean.host)||clean.host.length>253||clean.host.startsWith(".")||!clean.host.includes("."))
   throw new Error("Invalid SMTP hostname");
 if(clean.fromEmail!=="no-reply@assetflow360.com")throw new Error("Sender must be no-reply@assetflow360.com");
 if(!clean.username||clean.username.length>200)throw new Error("Invalid SMTP username");
 const {error}=await db.from("platform_smtp_settings").upsert({
  id:true,encrypted_config:encrypt(clean),updated_by:userId,updated_at:new Date().toISOString()
 },{onConflict:"id"});
 if(error)throw new Error("Unable to save SMTP settings");
 return {saved:true};
}

// This service uses strict SMTP TLS certificate verification. Never use rejectUnauthorized:false.
class SmtpSession{
 private socket:net.Socket;
 private pending:string[]=[];
 private waiters:((line:string)=>void)[]=[];
 private onData=(chunk:Buffer)=>{
  this.pending.push(...chunk.toString("utf8").split("\n"));
  // Keep partial line until next packet.
 };
 private buffer="";
 constructor(sock:net.Socket){this.socket=sock;this.attach(sock);}
 private attach(sock:net.Socket){
  this.socket=sock;
  sock.setTimeout(12000,()=>sock.destroy(new Error("SMTP timeout")));
  sock.on("data",this.receive);
 }
 private receive=(chunk:Buffer)=>{
  this.buffer+=chunk.toString("utf8");
  let end:number;
  while((end=this.buffer.indexOf("\n"))>=0){
   const line=this.buffer.slice(0,end).replace(/\r$/,"");this.buffer=this.buffer.slice(end+1);
   const waiter=this.waiters.shift();
   if(waiter)waiter(line);else this.pending.push(line);
  }
 };
 async response(code:number){
  const lines:string[]=[];
  for(;;){
   const line=this.pending.shift()??await new Promise<string>((resolve,reject)=>{
    const onError=(e:Error)=>{this.waiters=this.waiters.filter(w=>w!==resolve);reject(e);};
    this.socket.once("error",onError);
    this.waiters.push(v=>{this.socket.off("error",onError);resolve(v)});
   });
   lines.push(line);
   if(!/^\d{3}[- ]/.test(line))throw new Error("Malformed SMTP response");
   if(line[3]===" ")break;
   if(lines.length>30)throw new Error("Too many SMTP response lines");
  }
  if(Number(lines.at(-1)!.slice(0,3))!==code)throw new Error("SMTP server rejected request ("+lines.at(-1)!.slice(0,3)+")");
  return lines.join("\n");
 }
 async send(command:string,expected=250){
  this.socket.write(command+"\r\n");
  return this.response(expected);
 }
 async secure(host:string){
  const plain=this.socket;
  plain.off("data",this.receive);
  this.buffer="";this.pending=[];
  const secure=tls.connect({socket:plain,servername:host,rejectUnauthorized:true,minVersion:"TLSv1.2"});
  await new Promise<void>((resolve,reject)=>{
   secure.once("secureConnect",resolve);secure.once("error",reject);
  });
  this.attach(secure);
 }
 close(){this.socket.end();this.socket.destroy();}
}
/**
 * The shared SMTP service currently serves a valid mail.arofi.net certificate.
 * The marketing-domain mail alias resolves to that same SMTP server, but its
 * hostname is not on the SMTP daemon's active certificate. Connect using the
 * certified SMTP hostname while continuing strict TLS hostname verification.
 * Remove this mapping once aaPanel SMTP has a proper SAN certificate.
 */
export function smtpTransportHostname(host:string):string{
 return host==="mail.assetflow360.com" ? "mail.arofi.net" : host;
}
async function connect(config:SmtpConfig){
 const verifiedHost=smtpTransportHostname(config.host);
 const ip=await lookup(verifiedHost);
 // Admin configuration cannot be used as a proxy into private/internal infrastructure.
 if(ip.address.startsWith("127.")||ip.address.startsWith("10.")||ip.address.startsWith("192.168.")||
    ip.address.startsWith("169.254.")||ip.address==="::1"||ip.address.startsWith("172.16."))
    throw new Error("SMTP host must resolve to a public address");
 const sock=config.port===465?
  tls.connect({host:ip.address,port:465,servername:verifiedHost,rejectUnauthorized:true,minVersion:"TLSv1.2"}):
  net.connect({host:ip.address,port:587});
 await new Promise<void>((resolve,reject)=>{
  sock.once(config.port===465?"secureConnect":"connect",resolve);
  sock.once("error",reject);
  sock.setTimeout(12000,()=>sock.destroy(new Error("SMTP connection timeout")));
 });
 const c=new SmtpSession(sock);
 await c.response(220);
 await c.send("EHLO assetflow360.com");
 if(config.port===587){await c.send("STARTTLS",220);await c.secure(verifiedHost);await c.send("EHLO assetflow360.com");}
 await c.send("AUTH PLAIN "+Buffer.from("\u0000"+config.username+"\u0000"+config.password).toString("base64"),235);
 return c;
}
function safe(value:string){return value.replace(/[\r\n]/g," ").replace(/[<>]/g,"");}
export async function smtpTest(userId:string,to:string){
 await assertAdmin(userId);
 const config=await readConfig();
 if(!config)throw new Error("Save SMTP credentials first");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||to.length>250)throw new Error("Invalid test recipient");
 const c=await connect(config);
 try{
  await c.send("MAIL FROM:<"+config.fromEmail+">");
  await c.send("RCPT TO:<"+to+">");
  await c.send("DATA",354);
  const from="AssetFlow Security <"+config.fromEmail+">";
  const body="SMTP settings test completed. This message confirms that the configured mail account can send a secure email.";
  const payload=["From: "+from,"To: "+safe(to),"Subject: AssetFlow Security | SMTP test","MIME-Version: 1.0",
   "Content-Type: text/plain; charset=UTF-8","X-Auto-Response-Suppress: All","",body]
   .join("\r\n").replace(/\r\n\./g,"\r\n..");
  await c.send(payload+"\r\n.");
  try{await c.send("QUIT",221)}catch{/* DATA 250 already confirms acceptance */}
  return {ok:true,message:"SMTP test email was accepted by the mail server. Check recipient delivery."};
 }finally{c.close();}
}
export async function getConfiguredSmtpForApplication(category:MailCategory){
 const config=await readConfig();
 if(!config)throw new Error("SaaS SMTP configuration missing");
 const displayName={security:"AssetFlow Security",operations:"AssetFlow Operations",finance:"AssetFlow Finance"}[category];
 return {...config,displayName};
}

/** Human-written support replies should never be presented as automated reports. */
export async function sendPlatformContactReply(to:string,subject:string,body:string){
 if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(to)||to.length>250)throw new Error("Invalid contact recipient");
 const config=await getConfiguredSmtpForApplication("operations");
 const c=await connect(config);
 try{
  await c.send("MAIL FROM:<"+config.fromEmail+">");
  await c.send("RCPT TO:<"+to+">");
  await c.send("DATA",354);
  const payload=[
   "From: AssetFlow 360 Support <"+config.fromEmail+">",
   "To: "+safe(to),
   "Subject: "+safe(subject).slice(0,180),
   "MIME-Version: 1.0",
   "Content-Type: text/plain; charset=UTF-8",
   "X-Auto-Response-Suppress: All",
   "",
   body.slice(0,7000)
  ].join("\\r\\n").replace(/\\r\\n\\./g,"\\r\\n..");
  await c.send(payload+"\\r\\n.",250);
  // Once DATA receives 250, the server accepted the message. A later QUIT
  // error must not mark the already accepted reply as failed.
  try{await c.send("QUIT",221)}catch{/* best-effort shutdown */}
  return {accepted:true};
 }finally{c.close()}
}

/** Server-side platform email delivery using the saved, encrypted SMTP configuration. */
export async function sendPlatformReportEmail(to:string,subject:string,body:string){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||to.length>250)throw new Error("Invalid report recipient");
 const config=await getConfiguredSmtpForApplication("operations");
 const c=await connect(config);
 try{
  await c.send("MAIL FROM:<"+config.fromEmail+">");
  await c.send("RCPT TO:<"+to+">");
  await c.send("DATA",354);
  const lines=[
   "From: AssetFlow Operations <"+config.fromEmail+">",
   "To: "+safe(to),
   "Subject: "+safe(subject).slice(0,180),
   "MIME-Version: 1.0",
   "Content-Type: text/plain; charset=UTF-8",
   "X-Auto-Response-Suppress: All",
   "",
   "AssetFlow 360 | Operations",
   "--------------------------------",
   body.slice(0,7000),
   "",
   "This is an automated report for your organization's authorized administrators.",
   "Please do not reply to this message."
  ];
  const payload=lines.join("\r\n").replace(/\r\n\./g,"\r\n..");
  await c.send(payload+"\r\n.");
  try{await c.send("QUIT",221)}catch{/* DATA 250 already confirms acceptance */}
  return {accepted:true};
 }finally{c.close()}
}
