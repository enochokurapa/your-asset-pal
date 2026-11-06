import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getAdminPublicStats, updatePublicStat, type PublicStat } from "@/lib/platform-public-stats.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/saas-admin/statistics")({component:StatisticsPage});
function StatEditor({row,onSave}:{row:PublicStat;onSave:(row:PublicStat)=>Promise<void>}) {
  const [form,setForm]=useState(row);
  const [saving,setSaving]=useState(false);
  useEffect(()=>setForm(row),[row]);
  const save=async()=>{
    setSaving(true);
    try{await onSave(form);toast.success("Statistic updated");}
    catch(e:any){toast.error(e?.message||"Could not save statistic");}
    finally{setSaving(false);}
  };
  return <Card className="min-w-0 space-y-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold capitalize">{row.metric_key}</span>
      <span className="text-xs text-muted-foreground">Current display: {row.value.toLocaleString()}</span>
    </div>
    <label className="block text-xs font-medium">Public label
      <Input className="mt-1" maxLength={55} value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/>
    </label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-xs font-medium">Value source
        <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={form.source}
          onChange={e=>setForm({...form,source:e.target.value as "live"|"manual"})}>
          <option value="live">Live database</option><option value="manual">Manual override</option>
        </select>
      </label>
      <label className="block text-xs font-medium">Manual value
        <Input type="number" min="0" max="1000000000" className="mt-1" disabled={form.source!=="manual"}
          value={form.manual_value} onChange={e=>setForm({...form,manual_value:Number(e.target.value)})}/>
      </label>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form.is_visible} onChange={e=>setForm({...form,is_visible:e.target.checked})}/>
      Show on homepage
    </label>
    <Button disabled={saving||form.label.trim().length<3||!Number.isInteger(form.manual_value)} onClick={save}>
      {saving?"Saving…":"Save statistic"}
    </Button>
  </Card>;
}
function StatisticsPage(){
  const {isSaasAdmin,loading}=useAuth();
  const getter=useServerFn(getAdminPublicStats),setter=useServerFn(updatePublicStat);
  const qc=useQueryClient();
  const {data=[],isLoading,error}=useQuery({queryKey:["admin-public-stats"],enabled:isSaasAdmin,queryFn:async()=>getter({headers:await getServerAuthHeaders()})});
  if(loading)return null;
  if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
  return <div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-semibold">Homepage statistics</h1>
      <p className="mt-1 text-sm text-muted-foreground">Live values update from PostgreSQL as assets, organisations and locations are added. Choose Manual for an approved published number.</p></div>
    {error&&<p className="text-sm text-destructive">Could not load statistics.</p>}
    {isLoading?<p className="text-sm">Loading statistics…</p>:
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {data.map(row=><StatEditor key={row.metric_key} row={row} onSave={async form=>{
        await setter({data:{
          metric_key:form.metric_key,label:form.label,source:form.source,
          manual_value:form.manual_value,is_visible:form.is_visible,
        },headers:await getServerAuthHeaders()});
        await Promise.all([
          qc.invalidateQueries({queryKey:["admin-public-stats"]}),
          qc.invalidateQueries({queryKey:["public-stats"]}),
        ]);
      }}/>)}
    </div>}
    <p className="text-xs text-muted-foreground">Manual overrides are marked as custom figures in your administrative settings. Public totals do not expose tenant-specific records.</p>
  </div>;
}
