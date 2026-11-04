import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {listPlatformPaymentGateways,savePlatformPaymentGateway,
  setPlatformGatewayEnabled,testPlatformGateway} from "@/lib/payment-gateway.functions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card} from "@/components/ui/card";
import {toast} from "sonner";

export const Route=createFileRoute("/_app/saas-admin/payment-gateways")({component:PaymentGatewaySettings});
type Provider="yo"|"iotec";type Mode="sandbox"|"production";
type RecordStatus={provider:Provider;environment:Mode;is_enabled:boolean;updated_at:string};
function PaymentGatewaySettings(){
 const {isSaasAdmin,loading}=useAuth();
 const [provider,setProvider]=useState<Provider>("yo");
 const [environment,setEnvironment]=useState<Mode>("sandbox");
 const [rows,setRows]=useState<RecordStatus[]>([]);
 const [encryptionConfigured,setEncryptionConfigured]=useState(false);
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [username,setUsername]=useState("");
 const [password,setPassword]=useState("");
 const [clientId,setClientId]=useState("");
 const [clientSecret,setClientSecret]=useState("");
 const [walletId,setWalletId]=useState("");
 const reload=async()=>{
   const headers=await getServerAuthHeaders();
   const r=await listPlatformPaymentGateways({headers});
   setRows(r.configured as RecordStatus[]);
   setEncryptionConfigured(r.encryptionConfigured);
   setReady(true);
 };
 useEffect(()=>{if(isSaasAdmin)reload().catch(()=>toast.error("Could not load gateway settings"))},[isSaasAdmin]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const current=rows.find(r=>r.provider===provider&&r.environment===environment);
 const reset=()=>{setPassword("");setClientSecret("");};
 const save=async()=>{
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     const data=provider==="yo"?{provider,environment,username,password}
       :{provider,environment,clientId,clientSecret,walletId};
     await savePlatformPaymentGateway({headers,data});
     reset();
     await reload();
     toast.success("Credentials encrypted and saved. Gateway remains disabled until activated.");
   }catch(e:any){toast.error(e?.message||"Could not save credentials")}
   finally{setBusy(false)}
 };
 const setEnabled=async(enabled:boolean)=>{
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     await setPlatformGatewayEnabled({headers,data:{provider,environment,enabled}});
     await reload();
     toast.success(enabled?"Gateway enabled":"Gateway disabled");
   }catch(e:any){toast.error(e?.message||"Could not change gateway status")}
   finally{setBusy(false)}
 };
 const test=async()=>{
   setBusy(true);
   try{
     const headers=await getServerAuthHeaders();
     const result=await testPlatformGateway({headers,data:{provider,environment}});
     if(result.ok)toast.success(result.message);
     else toast.info(result.message);
   }catch(e:any){toast.error(e?.message||"Could not test gateway")}
   finally{setBusy(false)}
 };
 return <div className="mx-auto max-w-3xl space-y-5">
   <div><h1 className="text-2xl font-bold">Payment Gateways</h1>
   <p className="text-sm text-muted-foreground">Platform-only settings. Credentials never reappear after saving. Collections only; no payouts.</p></div>
   <Card className="space-y-5 p-6">
    <div className="grid gap-4 sm:grid-cols-2">
     <div className="space-y-1"><Label htmlFor="payment-provider">Provider</Label>
      <select id="payment-provider" className="w-full rounded-md border bg-background p-2" value={provider}
       onChange={e=>{setProvider(e.target.value as Provider);reset()}}>
       <option value="yo">Yo Uganda</option><option value="iotec">ioTec Pay</option></select></div>
     <div className="space-y-1"><Label htmlFor="payment-mode">Environment</Label>
      <select id="payment-mode" className="w-full rounded-md border bg-background p-2" value={environment}
       onChange={e=>{setEnvironment(e.target.value as Mode);reset()}}>
       <option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
    </div>
    <div className="rounded-md border p-3 text-sm">Status: <strong>{current?.is_enabled?"Enabled":current?"Stored · Disabled":"Not configured"}</strong>
       {current?.updated_at&&<p className="text-xs text-muted-foreground">Last updated {new Date(current.updated_at).toLocaleString()}</p>}
    </div>
    {provider==="yo"?<>
     <div className="space-y-1"><Label>API username</Label><Input autoComplete="off" value={username} onChange={e=>setUsername(e.target.value)}/></div>
     <div className="space-y-1"><Label>API password</Label><Input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></div>
    </>:<>
     <div className="space-y-1"><Label>Client ID</Label><Input autoComplete="off" value={clientId} onChange={e=>setClientId(e.target.value)}/></div>
     <div className="space-y-1"><Label>Client secret</Label><Input type="password" autoComplete="new-password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)}/></div>
     <div className="space-y-1"><Label>ioTec wallet ID</Label><Input value={walletId} onChange={e=>setWalletId(e.target.value)}/></div>
    </>}
    {!encryptionConfigured&&<p className="text-sm text-destructive">A server administrator must configure PAYMENT_GATEWAY_ENCRYPTION_KEY before saving credentials.</p>}
    <div className="flex flex-wrap gap-2">
      <Button onClick={save} disabled={!ready||busy||!encryptionConfigured}>Save encrypted credentials</Button>
      <Button variant="outline" onClick={test} disabled={!ready||busy||!current}>Test credentials</Button>
      {current&&<Button variant="outline" onClick={()=>setEnabled(!current.is_enabled)}
         disabled={busy||(!current.is_enabled&&!encryptionConfigured)}>
         {current.is_enabled?"Disable":"Enable"} {provider==="iotec"?"configuration":"collections"}
      </Button>}
    </div>
    <p className="text-xs text-muted-foreground">Yo Uganda uses the existing checkout integration when configured and enabled. ioTec credentials can be stored and tested; do not direct live collections to ioTec until its transaction adapter and reconciliation tests are completed.</p>
   </Card>
 </div>;
}
