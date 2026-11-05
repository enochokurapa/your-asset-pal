import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect,useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getPlatformSmtpSettings, savePlatformSmtpSettings, testPlatformSmtpSettings } from "@/lib/platform-smtp.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, ShieldCheck } from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/email")({component:EmailSettingsPage});
type Form={host:string;port:465|587;username:string;password:string;fromEmail:"no-reply@assetflow360.com"};
const empty:Form={host:"mail.assetflow360.com",port:587,username:"no-reply@assetflow360.com",password:"",fromEmail:"no-reply@assetflow360.com"};

function EmailSettingsPage(){
 const {loading,isSaasAdmin,user}=useAuth();
 const [form,setForm]=useState<Form>(empty);
 const [loaded,setLoaded]=useState(false);
 const [saving,setSaving]=useState(false);
 const [testing,setTesting]=useState(false);
 const [configured,setConfigured]=useState(false);
 const [encryptionReady,setEncryptionReady]=useState(false);
 const [testRecipient,setTestRecipient]=useState("");
 const [lastUpdated,setLastUpdated]=useState<string|null>(null);
 const reload=async()=>{
   const headers=await getServerAuthHeaders();
   const data=await getPlatformSmtpSettings({headers});
   setConfigured(data.configured);setEncryptionReady(data.encryptionReady);
   setForm(p=>({...p,host:data.host||p.host,port:data.port as 465|587,
     username:data.username||p.username,fromEmail:"no-reply@assetflow360.com",password:""}));
   setLastUpdated(data.updatedAt);setLoaded(true);
 };
 useEffect(()=>{if(!isSaasAdmin)return;let mounted=true;
   getServerAuthHeaders().then(headers=>getPlatformSmtpSettings({headers})).then(data=>{
     if(!mounted)return;
     setConfigured(data.configured);setEncryptionReady(data.encryptionReady);
     setForm(p=>({...p,host:data.host||p.host,port:data.port as 465|587,
       username:data.username||p.username,fromEmail:"no-reply@assetflow360.com",password:""}));
     setTestRecipient(user?.email||"");setLastUpdated(data.updatedAt);setLoaded(true);
   }).catch(()=>toast.error("Could not load SMTP settings"));
   return()=>{mounted=false};
 },[isSaasAdmin,user?.email]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const save=async()=>{
   setSaving(true);
   try{
     const headers=await getServerAuthHeaders();
     await savePlatformSmtpSettings({headers,data:form});
     await reload();
     toast.success("SMTP credentials encrypted and saved. Password is not displayed again.");
   }catch(e:any){toast.error(e?.message||"Unable to save SMTP credentials");}
   finally{setSaving(false)}
 };
 const test=async()=>{
   setTesting(true);
   try{
     const headers=await getServerAuthHeaders();
     const result=await testPlatformSmtpSettings({headers,data:{to:testRecipient}});
     if(result.ok)toast.success(result.message);
     else toast.error(result.message);
   }catch(e:any){toast.error(e?.message||"SMTP connection failed");}
   finally{setTesting(false)}
 };
 return <div className="mx-auto max-w-3xl space-y-5">
  <div className="flex items-start gap-3"><Mail className="mt-1 h-7 w-7 text-primary"/>
   <div><h1 className="text-2xl font-bold">Email & SMTP</h1>
    <p className="text-sm text-muted-foreground">Secure platform email credentials and branded messaging for AssetFlow 360.</p></div>
  </div>
  <Card className="space-y-5 p-6">
   <div className="rounded-lg border p-3 text-sm">
    <p className="font-semibold">{configured?"SMTP credentials saved":"SMTP not configured"}</p>
    <p className="mt-1 text-muted-foreground">Sender: no-reply@assetflow360.com · Security, Operations and Finance display names</p>
    {lastUpdated&&<p className="text-xs text-muted-foreground">Updated {new Date(lastUpdated).toLocaleString()}</p>}
   </div>
   <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-1"><Label htmlFor="smtp-host">SMTP server hostname</Label>
     <Input id="smtp-host" autoComplete="off" value={form.host} disabled={!loaded||saving}
       onChange={e=>setForm(p=>({...p,host:e.target.value}))}/></div>
    <div className="space-y-1"><Label htmlFor="smtp-port">Secure port</Label>
     <select id="smtp-port" className="w-full rounded-md border bg-background p-2" value={form.port}
      disabled={!loaded||saving} onChange={e=>setForm(p=>({...p,port:Number(e.target.value) as 465|587}))}>
      <option value={587}>587 — STARTTLS</option><option value={465}>465 — implicit TLS</option>
     </select></div>
   </div>
   <div className="space-y-1"><Label htmlFor="smtp-user">SMTP login username</Label>
    <Input id="smtp-user" autoComplete="off" value={form.username} disabled={!loaded||saving}
      onChange={e=>setForm(p=>({...p,username:e.target.value}))}/></div>
   <div className="space-y-1"><Label htmlFor="smtp-password">SMTP password</Label>
    <Input id="smtp-password" type="password" autoComplete="new-password"
      placeholder={configured?"Leave blank to keep saved password":"Enter account password"}
      value={form.password} disabled={!loaded||saving}
      onChange={e=>setForm(p=>({...p,password:e.target.value}))}/>
    <p className="text-xs text-muted-foreground">Encrypted on the server; never embedded in frontend JavaScript or returned to the browser.</p>
   </div>
   <div className="space-y-1"><Label htmlFor="smtp-sender">Sender email</Label>
    <Input id="smtp-sender" value={form.fromEmail} disabled readOnly/></div>
   {!encryptionReady&&<p className="text-sm text-destructive">The server needs SMTP_SETTINGS_ENCRYPTION_KEY configured securely before it can store credentials.</p>}
   <div className="flex flex-wrap items-center gap-3">
    <Button disabled={!loaded||saving||!encryptionReady} onClick={save}>{saving?"Saving…":"Save encrypted SMTP settings"}</Button>
    <span className="text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline h-3 w-3"/>TLS certificate verification is always required.</span>
   </div>
  </Card>
  <Card className="space-y-3 p-6">
   <h2 className="font-semibold">Test email delivery</h2>
   <p className="text-sm text-muted-foreground">This sends a single AssetFlow Security test message to the specified address. A successful test means the SMTP server accepted it; confirm receipt too.</p>
   <div className="flex flex-col gap-3 sm:flex-row">
    <Input type="email" aria-label="Test recipient email" placeholder="admin@example.com"
     value={testRecipient} onChange={e=>setTestRecipient(e.target.value)}/>
    <Button variant="outline" disabled={!configured||testing} onClick={test}>{testing?"Testing…":"Send test email"}</Button>
   </div>
  </Card>
  <Card className="space-y-2 p-6">
   <h2 className="font-semibold">Authentication email activation</h2>
   <p className="text-sm text-muted-foreground">The email credentials saved here are used for application mail. The separate self-hosted authentication service currently reads SMTP settings from its runtime environment. Its email verification and password recovery must be activated through a controlled configuration rollout. This screen does not silently restart the authentication service.</p>
  </Card>
 </div>;
}
