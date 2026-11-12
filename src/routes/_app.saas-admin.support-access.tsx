import {createFileRoute} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getPlatformOperationsAnalytics} from "@/lib/tenant-operations.functions";
import {
  requestTenantSupport,listTenantSupport,readTenantSupportDiagnostics,
  revokeTenantSupport,listTenantSupportAudit,
} from "@/lib/tenant-support.functions";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export const Route=createFileRoute("/_app/saas-admin/support-access")({component:SupportAccessPage});
function SupportAccessPage(){
  const client=useQueryClient();
  const getBusinesses=useServerFn(getPlatformOperationsAnalytics);
  const list=useServerFn(listTenantSupport);
  const request=useServerFn(requestTenantSupport);
  const inspect=useServerFn(readTenantSupportDiagnostics);
  const revoke=useServerFn(revokeTenantSupport);
  const audit=useServerFn(listTenantSupportAudit);
  const [tenantId,setTenantId]=useState("");
  const [reason,setReason]=useState("");
  const [scope,setScope]=useState<"diagnostics_read"|"operational_support">("diagnostics_read");
  const [working,setWorking]=useState(false);
  const [result,setResult]=useState<any>(null);
  const [events,setEvents]=useState<any[]>([]);
  const call=async(fn:any,data?:any)=>fn({headers:await getServerAuthHeaders(),...(data?{data}:{})});
  const businesses=useQuery({queryKey:["support-businesses"],queryFn:()=>call(getBusinesses)});
  const sessions=useQuery({queryKey:["tenant-support-admin-sessions"],queryFn:()=>call(list)});
  const execute=async(fn:()=>Promise<any>,ok:string)=>{
    setWorking(true);
    try{const r=await fn();toast.success(ok);await client.invalidateQueries({queryKey:["tenant-support-admin-sessions"]});return r;}
    catch(e:any){toast.error(e?.message||"Support operation failed");return null;}
    finally{setWorking(false);}
  };
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">Tenant Support Access</h1>
      <p className="text-sm text-muted-foreground">Request explicit customer authorization before inspecting a business. Never sign in as the customer.</p>
    </header>
    <Card className="space-y-4 p-5">
      <h2 className="font-semibold">Request a support session</h2>
      <div className="space-y-2"><Label htmlFor="support-business">Business</Label>
        <select id="support-business" className="w-full rounded-md border bg-background p-2" value={tenantId} onChange={e=>setTenantId(e.target.value)}>
          <option value="">Select business</option>
          {(businesses.data?.organisations??[]).map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor="support-scope">Requested permission</Label>
        <select id="support-scope" className="w-full rounded-md border bg-background p-2" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}>
          <option value="diagnostics_read">Diagnostics only (read-only)</option>
          <option value="operational_support">Operational support (requires separate action authorization)</option>
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor="support-reason">Issue / support ticket reference</Label>
        <Input id="support-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} placeholder="Describe the customer issue and why access is required" />
      </div>
      <p className="text-xs text-muted-foreground">Customer administrator approval is required. Approval lasts at most 15 minutes; no customer passwords or hidden accounts are used. Operational changes are not enabled by this module.</p>
      <Button disabled={working||!tenantId||reason.trim().length<15} onClick={()=>execute(()=>call(request,{tenantId,reason,scope}),"Support request submitted")}>Request access</Button>
    </Card>
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Your support sessions</h2>
      {sessions.isLoading&&<p>Loading sessions…</p>}
      {sessions.error&&<p className="text-destructive">Unable to load support sessions</p>}
      {(sessions.data??[]).map((s:any)=><div key={s.id} className="space-y-2 rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{(businesses.data?.organisations??[]).find((t:any)=>t.id===s.tenant_id)?.name||s.tenant_id}</strong>
          <span>{s.state}{s.state==="approved"&&new Date(s.expires_at).getTime()<=Date.now()?" (expired)":""}</span>
        </div>
        <p>{s.reason}</p>
        <p className="text-xs text-muted-foreground">{s.scope} · Requested {new Date(s.requested_at).toLocaleString()} {s.expires_at&&"· Expires "+new Date(s.expires_at).toLocaleString()}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={working||s.state!=="approved"||Date.parse(s.expires_at)<=Date.now()} onClick={async()=>{const r=await execute(()=>call(inspect,{sessionId:s.id}),"Diagnostics recorded in audit log");if(r){setResult(r);setEvents([]);}}}>View diagnostics</Button>
          <Button size="sm" variant="outline" disabled={working} onClick={async()=>{const r=await execute(()=>call(audit,{sessionId:s.id}),"Audit loaded");if(r){setEvents(r);setResult(null);}}}>View audit</Button>
          <Button size="sm" variant="destructive" disabled={working||s.state!=="approved"} onClick={()=>execute(()=>call(revoke,{sessionId:s.id}),"Session revoked")}>Revoke</Button>
        </div>
      </div>)}
    </Card>
    {result&&<Card className="space-y-3 p-5"><h2 className="font-semibold">Tenant diagnostics — support mode</h2>
      <p className="text-sm">Business: {result.tenant?.name} · Subscription: {result.tenant?.subscription_status}</p>
      <p className="text-sm">Assets: {result.assetCount} · Active users: {result.activeUserCount}</p>
      <p className="text-xs text-muted-foreground">Read-only snapshot. Permission must be checked afresh on every server request.</p>
      {(result.recent??[]).map((x:any,i:number)=><p key={i} className="text-xs">{x.created_at} · {x.entity_type} · {x.action}</p>)}
    </Card>}
    {!!events.length&&<Card className="space-y-2 p-5"><h2 className="font-semibold">Support audit trail</h2>
      {events.map((e:any,i:number)=><p key={i} className="border-b py-2 text-xs">{new Date(e.recorded_at).toLocaleString()} · {e.action} · {e.actor_id}</p>)}
    </Card>}
  </div>;
}
