import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getPlatformEmailReports,setPlatformEmailReports} from "@/lib/platform-email-reports.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export const Route=createFileRoute("/_app/saas-admin/email-reports")({component:ReportsPage});
type Config={enabled:boolean;frequency:"monthly"|"daily";send_hour:number};
function ReportsPage(){
 const {loading,isSaasAdmin}=useAuth();
 const [config,setConfig]=useState<Config>({enabled:false,frequency:"monthly",send_hour:6});
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!isSaasAdmin)return;
  let active=true;
  getServerAuthHeaders().then(headers=>getPlatformEmailReports({headers})).then(r=>{
   if(active){setConfig(r);setReady(true)}
  }).catch(()=>toast.error("Could not load automated report settings"));
  return()=>{active=false};
 },[isSaasAdmin]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const save=async()=>{
  setBusy(true);
  try{
   const headers=await getServerAuthHeaders();
   await setPlatformEmailReports({headers,data:config});
   toast.success("Automatic report schedule saved");
  }catch(e:any){toast.error(e?.message||"Could not save email report settings")}
  finally{setBusy(false)}
 };
 return <div className="mx-auto max-w-3xl space-y-5">
  <header><h1 className="text-2xl font-bold">Automated Email Reports</h1>
   <p className="text-sm text-muted-foreground">Schedule operational asset summaries for paid customer administrators.</p></header>
  <Card className="space-y-5 p-6">
   <div className="flex items-center justify-between gap-4">
    <div><Label>Enable automatic reports</Label>
     <p className="text-xs text-muted-foreground">Off by default. Reports are sent only to verified business administrator email addresses.</p></div>
    <Switch checked={config.enabled} disabled={!ready||busy} onCheckedChange={v=>setConfig(p=>({...p,enabled:v}))}/>
   </div>
   <div className="space-y-2">
    <Label htmlFor="frequency">Frequency</Label>
    <select id="frequency" className="w-full rounded-md border bg-background p-2" value={config.frequency}
      disabled={!ready||busy||!config.enabled} onChange={e=>setConfig(p=>({...p,frequency:e.target.value as Config["frequency"]}))}>
      <option value="monthly">Monthly report (recommended)</option>
      <option value="daily">Daily report</option>
    </select>
   </div>
   <div className="space-y-2">
    <Label htmlFor="sendhour">Send time (East Africa Time, UTC+3)</Label>
    <select id="sendhour" className="w-full rounded-md border bg-background p-2" value={config.send_hour}
      disabled={!ready||busy||!config.enabled} onChange={e=>setConfig(p=>({...p,send_hour:Number(e.target.value)}))}>
     {[6,7,8,9,12,15,18].map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00 EAT</option>)}
    </select>
   </div>
   <Button onClick={save} disabled={!ready||busy}>{busy?"Saving…":"Save report schedule"}</Button>
   <p className="text-xs text-muted-foreground">
    Reports contain aggregate asset statistics only, not personal details. Delivery uses your configured Email & SMTP account.
    Reports are sent after the selected local time, subject to system availability and verified recipients.
   </p>
  </Card>
 </div>;
}
