import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getPlatformSessionPolicy, setPlatformSessionPolicy } from "@/lib/session-policy.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route=createFileRoute("/_app/saas-admin/security")({component:SecurityPolicyPage});
type Policy={idle_user_minutes:number;idle_admin_minutes:number;idle_saas_minutes:number;password_expiry_days:number|null};
const defaults:Policy={idle_user_minutes:30,idle_admin_minutes:15,idle_saas_minutes:10,password_expiry_days:null};

function SecurityPolicyPage(){
  const {isSaasAdmin,loading}=useAuth();
  const [data,setData]=useState<Policy>(defaults);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!isSaasAdmin)return;
    let mounted=true;
    getServerAuthHeaders().then(headers=>getPlatformSessionPolicy({headers}))
      .then(value=>{if(mounted){setData(value as Policy);setLoaded(true)}})
      .catch(()=>toast.error("Unable to load security policy"));
    return ()=>{mounted=false};
  },[isSaasAdmin]);
  if(loading)return null;
  if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
  const save=async()=>{
    setBusy(true);
    try{
      const headers=await getServerAuthHeaders();
      await setPlatformSessionPolicy({headers,data});
      toast.success("Inactivity policy saved");
    }catch(e:any){toast.error(e?.message||"Unable to save security policy")}
    finally{setBusy(false)}
  };
  return <div className="mx-auto max-w-3xl space-y-5">
    <div><h1 className="text-2xl font-bold">Security & Sessions</h1>
      <p className="text-sm text-muted-foreground">Global inactivity controls. Active users have no fixed 8-hour logout deadline.</p></div>
    <Card className="space-y-5 p-6">
      {([["idle_user_minutes","Field and office users",5,240],
         ["idle_admin_minutes","Business administrators",5,120],
         ["idle_saas_minutes","SaaS administrators",5,60]] as const).map(([key,label,min,max])=>
        <div key={key} className="grid gap-2 sm:grid-cols-[1fr_140px] sm:items-center">
          <Label htmlFor={key}>{label} — minutes inactive</Label>
          <Input id={key} type="number" min={min} max={max} value={data[key]} disabled={!loaded||busy}
            onChange={e=>setData(p=>({...p,[key]:Number(e.target.value)}))}/>
        </div>)}
      <div className="space-y-2">
        <Label htmlFor="expiry">Password rotation policy</Label>
        <select id="expiry" className="w-full rounded-md border bg-background p-2" disabled={!loaded||busy}
          value={data.password_expiry_days??"none"}
          onChange={e=>setData(p=>({...p,password_expiry_days:e.target.value==="none"?null:Number(e.target.value)}))}>
          <option value="none">Only on compromise (recommended)</option>
          <option value="30">30 days — policy value</option>
          <option value="60">60 days — policy value</option>
          <option value="90">90 days — policy value</option>
        </select>
        <p className="text-xs text-muted-foreground">Password expiry enforcement is not yet active. Do not rely on this setting until the associated server-side enforcement is deployed and tested.</p>
      </div>
      <Button disabled={!loaded||busy||[data.idle_user_minutes,data.idle_admin_minutes,data.idle_saas_minutes].some(n=>!Number.isInteger(n))} onClick={save}>{busy?"Saving…":"Save session policy"}</Button>
      <p className="text-xs text-muted-foreground">Browser inactivity locking is active when this code is deployed. Full server-side idle-token enforcement remains a separate security milestone.</p>
    </Card>
  </div>;
}
