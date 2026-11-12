import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { listTenantSupport } from "@/lib/tenant-support.functions";
import { listSupportRecords, updateSupportRecord } from "@/lib/support-record-operations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type RecordKind="assets"|"categories"|"locations";
const fields:Record<RecordKind,string[]>={
  assets:["name","description","serial_number","asset_tag","status","purchase_value","purchase_date","category_id","location_id"],
  categories:["name","description"],
  locations:["name","address"],
};
export const Route=createFileRoute("/_app/saas-admin/support-records")({component:SupportRecordEditor});
function SupportRecordEditor(){
  const list=useServerFn(listTenantSupport);
  const get=useServerFn(listSupportRecords);
  const update=useServerFn(updateSupportRecord);
  const [sessionId,setSessionId]=useState("");
  const [recordType,setRecordType]=useState<RecordKind>("assets");
  const [recordId,setRecordId]=useState("");
  const [field,setField]=useState("name");
  const [value,setValue]=useState("");
  const [explanation,setExplanation]=useState("");
  const [busy,setBusy]=useState(false);
  const call=async(fn:any,data?:any)=>fn({headers:await getServerAuthHeaders(),...(data?{data}:{})});
  const sessions=useQuery({queryKey:["support-session-options"],queryFn:()=>call(list),refetchInterval:30000});
  const available=(sessions.data??[]).filter((s:any)=>s.state==="approved"&&
    s.scope==="operational_support"&&Date.parse(s.expires_at)>Date.now());
  const rows=useQuery({queryKey:["support-records",sessionId,recordType],enabled:!!sessionId,
    queryFn:()=>call(get,{sessionId,recordType}),staleTime:0});
  useEffect(()=>{setRecordId("");setField(fields[recordType][0]);setValue("");},[recordType,sessionId]);
  const selected=(rows.data?.rows??[]).find((r:any)=>r.id===recordId);
  useEffect(()=>{const previous=selected?.[field];setValue(previous==null?"":String(previous));},[selected,field]);
  async function save(){
    setBusy(true);
    try{
      await call(update,{sessionId,recordType,recordId,field,
        value:value.trim()===""&&field!=="name"?null:value,
        explanation});
      toast.success("Customer record updated and auditable");
      await rows.refetch();
      setExplanation("");
    }catch(e:any){toast.error(e?.message||"Change denied");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">Approved Customer Record Changes</h1>
      <p className="text-sm text-muted-foreground">Edit one field at a time in an approved business support session. Every change includes the old value, new value, acting administrator, and reason.</p>
    </header>
    <Card className="space-y-4 p-5">
      <div className="space-y-2"><Label htmlFor="support-session">Approved operational support session</Label>
        <select id="support-session" className="w-full rounded-md border bg-background p-2" value={sessionId} onChange={e=>setSessionId(e.target.value)}>
          <option value="">Choose approved session</option>
          {available.map((s:any)=><option key={s.id} value={s.id}>{s.tenant_id} · Expires {new Date(s.expires_at).toLocaleTimeString()}</option>)}
        </select></div>
      <div className="space-y-2"><Label htmlFor="support-record-type">Record type</Label>
        <select id="support-record-type" className="w-full rounded-md border bg-background p-2" value={recordType} onChange={e=>setRecordType(e.target.value as RecordKind)}>
          <option value="assets">Assets</option><option value="categories">Categories</option><option value="locations">Locations</option>
        </select></div>
      {rows.error&&<p className="text-destructive" role="alert">Records could not be loaded. The support session may be expired or revoked.</p>}
      {rows.data?.rows?.length===150&&<p className="text-xs text-muted-foreground">Showing first 150 records. Additional search/filtering will be needed for larger businesses.</p>}
      <div className="space-y-2"><Label htmlFor="support-record">Existing record</Label>
        <select id="support-record" className="w-full rounded-md border bg-background p-2" value={recordId} onChange={e=>setRecordId(e.target.value)}>
          <option value="">Choose record</option>
          {(rows.data?.rows??[]).map((r:any)=><option value={r.id} key={r.id}>{r.name||r.asset_tag||r.id} · {r.id.slice(0,8)}</option>)}
        </select></div>
      <div className="space-y-2"><Label htmlFor="support-field">Editable field</Label>
        <select id="support-field" className="w-full rounded-md border bg-background p-2" value={field} onChange={e=>setField(e.target.value)}>
          {fields[recordType].map(f=><option value={f} key={f}>{f.replaceAll("_"," ")}</option>)}
        </select></div>
      <div className="space-y-2"><Label htmlFor="support-value">New value</Label>
        {field==="status"?
          <select id="support-value" className="w-full rounded-md border bg-background p-2" value={value} onChange={e=>setValue(e.target.value)}>
            {["in_use","in_storage","under_repair","retired","missing","disposed","checked_out"].map(s=><option value={s} key={s}>{s}</option>)}
          </select>:
          <Input id="support-value" value={value} onChange={e=>setValue(e.target.value)} maxLength={2000}/>}
      </div>
      <div className="space-y-2"><Label htmlFor="support-change-reason">Reason for this particular edit</Label>
        <Input id="support-change-reason" value={explanation} onChange={e=>setExplanation(e.target.value)} maxLength={1000} placeholder="Reference support ticket and explain correction"/>
      </div>
      <p className="text-xs text-muted-foreground">No bulk updates, deletions, financial transfers, password changes or user permissions are available through this editor.</p>
      <Button disabled={busy||!sessionId||!recordId||explanation.trim().length<15} onClick={save}>{busy?"Applying…":"Save audited change"}</Button>
    </Card>
  </div>;
}
