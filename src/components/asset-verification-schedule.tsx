import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getAssetVerificationPolicy, updateAssetVerificationPolicy } from "@/lib/asset-verification-policy.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarClock, ShieldCheck } from "lucide-react";

type State = "pending"|"attention"|"overdue"|"due_soon"|"current";
type ScheduledAsset = {
  asset_id:string;asset_tag:string;asset_name:string;verification_state:State;
  last_verified_at:string|null;verification_due_at:string|null;
};
const categories: {key:State;title:string}[] = [
  {key:"pending",title:"Not yet verified"},
  {key:"attention",title:"Verification failed"},
  {key:"overdue",title:"Overdue"},
  {key:"due_soon",title:"Due within 30 days"},
  {key:"current",title:"Current"},
];
const descriptions:Record<State,string>={
 pending:"First physical verification required",
 attention:"Latest inspection found a mismatch or missing asset",
 overdue:"Last successful verification is past its renewal date",
 due_soon:"Annual or custom verification renewal approaching",
 current:"Verified and within the business validity period",
};

export function AssetVerificationSchedule() {
 const {tenantId,isTenantAdmin,branchScope}=useAuth();
 const qc=useQueryClient();
 const [months,setMonths]=useState<number|null>(null);
 const [saving,setSaving]=useState(false);
 const branchIds=branchScope?Array.from(branchScope).sort():null;
 const branchKey=branchIds?.join(",")??"all";

 const {data:policy,isLoading:policyLoading}=useQuery({
  queryKey:["asset-verification-policy",tenantId],enabled:!!tenantId,
  queryFn:async()=>getAssetVerificationPolicy({headers:await getServerAuthHeaders()}),
 });
 const {data:overview,isLoading:overviewLoading,error:overviewError}=useQuery({
  queryKey:["verification-overview",tenantId,branchKey],enabled:!!tenantId,
  queryFn:async()=>{
   const scope=(q:any)=>branchIds&&branchIds.length?q.in("branch_id",branchIds):q;
   if(branchIds&&branchIds.length===0)return {counts:{} as Record<State,number>,assets:[] as ScheduledAsset[]};
   const counts={} as Record<State,number>;
   await Promise.all(categories.map(async ({key})=>{
    const {count,error}=await scope((supabase as any).from("asset_verification_schedule")
      .select("asset_id",{head:true,count:"exact"}).eq("verification_state",key));
    if(error)throw error;
    counts[key]=count??0;
   }));
   const {data,error}=await scope((supabase as any).from("asset_verification_schedule")
     .select("asset_id,asset_tag,asset_name,verification_state,last_verified_at,verification_due_at")
     .in("verification_state",["pending","attention","overdue","due_soon"])
     .order("registered_at",{ascending:true}).limit(40));
   if(error)throw error;
   return {counts,assets:(data??[]) as ScheduledAsset[]};
  },
 });

 const save=async()=>{
  const value=months??policy?.intervalMonths;
  if(!value)return;
  setSaving(true);
  try{
   await updateAssetVerificationPolicy({headers:await getServerAuthHeaders(),data:{intervalMonths:value}});
   await Promise.all([
    qc.invalidateQueries({queryKey:["asset-verification-policy",tenantId]}),
    qc.invalidateQueries({queryKey:["verification-overview",tenantId]})
   ]);
   setMonths(null);
   toast.success("Asset verification validity updated for your business.");
  }catch(e:any){toast.error(e?.message||"Unable to save verification policy");}
  finally{setSaving(false);}
 };
 const currentMonths=months??policy?.intervalMonths??12;
 return <div className="space-y-4">
   <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="flex items-start gap-2">
      <ShieldCheck className="mt-1 h-5 w-5 text-primary"/>
      <div><h2 className="text-lg font-semibold">Asset Verification Validity</h2>
       <p className="text-sm text-muted-foreground">Every registered or imported asset requires a physical verification. A successful verification remains valid for the chosen period.</p>
      </div>
     </div>
     <Badge variant="outline">{policyLoading?"Loading…":`Every ${policy?.intervalMonths??12} months`}</Badge>
    </div>
    {isTenantAdmin && <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="min-w-[170px] space-y-2">
        <Label htmlFor="verification-frequency">Business verification interval</Label>
        <select id="verification-frequency" value={currentMonths}
          disabled={policyLoading||saving}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          onChange={e=>setMonths(Number(e.target.value))}>
          {[1,3,6,12,18,24,36,48,60].map(n=><option value={n} key={n}>{n===12?"12 months (default)":n+" months"}</option>)}
        </select>
      </div>
      <Button onClick={save} disabled={saving||policyLoading||currentMonths===policy?.intervalMonths}>
       {saving?"Saving…":"Save validity"}
      </Button>
      <p className="w-full text-xs text-muted-foreground">Only business administrators can change this setting. Existing verification dates stay unchanged; overdue status recalculates from the new interval.</p>
     </div>}
    {overviewError && <p className="text-sm text-destructive">Verification status could not be loaded. Contact your administrator if this continues.</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {categories.map(({key,title})=><div key={key} className="rounded-md border p-3">
       <p className="text-xs text-muted-foreground">{title}</p>
       <p className="text-2xl font-semibold">{overviewLoading?"…":overview?.counts[key]??0}</p>
      </div>)}
    </div>
   </Card>
   <Card className="overflow-hidden">
     <div className="border-b p-4">
      <h3 className="font-semibold">Assets requiring verification</h3>
      <p className="text-xs text-muted-foreground">Oldest 40 visible assets needing initial verification, follow-up or renewal. Select a branch and scan the asset below to record your findings.</p>
     </div>
     <div className="overflow-x-auto">
       <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/30"><tr>
         <th className="p-3">Asset</th><th className="p-3">Verification</th><th className="p-3">Next due</th>
        </tr></thead>
        <tbody>
         {(overview?.assets??[]).map(a=><tr key={a.asset_id} className="border-b last:border-0">
          <td className="p-3"><p className="font-medium">{a.asset_name}</p><p className="text-xs text-muted-foreground">{a.asset_tag}</p></td>
          <td className="p-3"><Badge variant="outline">{categories.find(c=>c.key===a.verification_state)?.title??a.verification_state}</Badge>
            <p className="mt-1 text-xs text-muted-foreground">{descriptions[a.verification_state]}</p></td>
          <td className="p-3">{a.verification_due_at?new Date(a.verification_due_at).toLocaleDateString():"Verify now"}</td>
         </tr>)}
         {!overviewLoading&&!overview?.assets.length&&<tr><td colSpan={3} className="p-5 text-center text-muted-foreground">No assets currently require verification.</td></tr>}
        </tbody>
       </table>
     </div>
   </Card>
 </div>;
}
