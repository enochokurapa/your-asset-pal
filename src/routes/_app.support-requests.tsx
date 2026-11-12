import {createFileRoute} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {listTenantSupport,decideTenantSupport,revokeTenantSupport,listTenantSupportAudit} from "@/lib/tenant-support.functions";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {toast} from "sonner";

export const Route=createFileRoute("/_app/support-requests")({component:BusinessSupportRequests});
function BusinessSupportRequests(){
  const list=useServerFn(listTenantSupport);
  const decide=useServerFn(decideTenantSupport);
  const revoke=useServerFn(revokeTenantSupport);
  const getAudit=useServerFn(listTenantSupportAudit);
  const client=useQueryClient();
  const [busy,setBusy]=useState(false);
  const [history,setHistory]=useState<any[]>([]);
  const call=async(fn:any,data?:any)=>fn({headers:await getServerAuthHeaders(),...(data?{data}:{})});
  const requests=useQuery({queryKey:["business-support-requests"],queryFn:()=>call(list)});
  async function perform(run:()=>Promise<any>,message:string){
    setBusy(true);
    try{const r=await run();toast.success(message);await client.invalidateQueries({queryKey:["business-support-requests"]});return r;}
    catch(e:any){toast.error(e.message||"Unable to update support permission");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">Platform Support Requests</h1>
      <p className="text-sm text-muted-foreground">Your business administrator controls whether Assetflow360 support may inspect this workspace. Approvals last a maximum of 15 minutes and can be revoked at any time.</p>
    </header>
    {requests.error&&<p role="alert" className="text-destructive">Business administrator access is required to review support requests.</p>}
    <Card className="space-y-3 p-5">
      {(requests.data??[]).map((s:any)=><section key={s.id} className="rounded-md border p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{s.scope==="diagnostics_read"?"Read-only diagnostics":"Operational support request"}</h2><span>{s.state}</span></div>
        <p>{s.reason}</p>
        <p className="text-xs text-muted-foreground">Requested {new Date(s.requested_at).toLocaleString()} · Requester: {s.administrator_id}</p>
        {s.expires_at&&<p className="text-xs">Expires: {new Date(s.expires_at).toLocaleString()}</p>}
        <div className="flex flex-wrap gap-2">
          {s.state==="pending"&&<><Button disabled={busy||Date.now()-Date.parse(s.requested_at)>86400000} onClick={()=>perform(()=>call(decide,{sessionId:s.id,approve:true}),"Support access approved for 15 minutes")}>Approve for 15 minutes</Button>
            <Button variant="outline" disabled={busy} onClick={()=>perform(()=>call(decide,{sessionId:s.id,approve:false}),"Support request declined")}>Decline</Button></>}
          {s.state==="approved"&&<Button variant="destructive" disabled={busy} onClick={()=>perform(()=>call(revoke,{sessionId:s.id}),"Support access revoked")}>Revoke immediately</Button>}
          <Button variant="outline" disabled={busy} onClick={async()=>{const r=await perform(()=>call(getAudit,{sessionId:s.id}),"Audit records loaded");if(r)setHistory(r);}}>View audit log</Button>
        </div>
      </section>)}
      {requests.isLoading&&<p>Loading support requests…</p>}
      {!requests.isLoading&&!requests.data?.length&&<p>No support requests found.</p>}
    </Card>
    {!!history.length&&<Card className="space-y-2 p-5"><h2 className="font-semibold">Recorded support activity</h2>
      {history.map((e:any,i:number)=><p key={i} className="text-xs border-b py-2">{new Date(e.recorded_at).toLocaleString()} · {e.action} · {e.actor_id}</p>)}
    </Card>}
  </div>;
}
