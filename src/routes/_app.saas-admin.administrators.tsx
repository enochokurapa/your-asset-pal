import {createFileRoute} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {listPlatformAdministrators,searchPlatformAdminCandidates,changePlatformAdministrator,listPlatformAdministratorAudit} from "@/lib/platform-admin-management.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";
export const Route=createFileRoute("/_app/saas-admin/administrators")({component:PlatformAdminManagement});
function PlatformAdminManagement(){
 const qc=useQueryClient();
 const list=useServerFn(listPlatformAdministrators);
 const searchFn=useServerFn(searchPlatformAdminCandidates);
 const changeFn=useServerFn(changePlatformAdministrator);
 const logFn=useServerFn(listPlatformAdministratorAudit);
 const [search,setSearch]=useState("");
 const [matches,setMatches]=useState<any[]>([]);
 const [target,setTarget]=useState<any>(null);
 const [reason,setReason]=useState("");
 const [confirmEmail,setConfirmEmail]=useState("");
 const [working,setWorking]=useState(false);
 const call=async(fn:any,data?:any)=>fn({headers:await getServerAuthHeaders(),...(data?{data}:{})});
 const admins=useQuery({queryKey:["platform-admins"],queryFn:()=>call(list)});
 const audit=useQuery({queryKey:["platform-admin-role-audit"],queryFn:()=>call(logFn)});
 async function lookup(){setWorking(true);try{setMatches(await call(searchFn,{search}));}catch(e:any){toast.error(e.message)}finally{setWorking(false)}}
 async function save(){
  if(!target)return;
  setWorking(true);
  try{
   await call(changeFn,{targetUserId:target.id,makeAdmin:!target.is_saas_admin,reason,confirmEmail});
   toast.success("SaaS Admin membership updated and audited");
   setTarget(null);setReason("");setConfirmEmail("");setMatches([]);
   await Promise.all([qc.invalidateQueries({queryKey:["platform-admins"]}),qc.invalidateQueries({queryKey:["platform-admin-role-audit"]})]);
  }catch(e:any){toast.error(e.message||"Role change blocked")}finally{setWorking(false)}
 }
 return <div className="space-y-6">
  <header><h1 className="text-2xl font-bold">SaaS Administrators</h1>
  <p className="text-sm text-muted-foreground">Manage up to three active platform administrators. MFA is required through the existing sign-in policy. Every appointment and removal is recorded.</p></header>
  <Card className="space-y-3 p-5"><h2 className="font-semibold">Current platform administrators</h2>
  <p className="text-xs text-muted-foreground">Active limit: 3</p>
  {(admins.data?.administrators??[]).map((u:any)=><div key={u.id} className="flex justify-between border-b py-2 text-sm">
  <span>{u.full_name||u.email} ({u.email})</span><span>{u.is_active?"Active":"Inactive"}</span></div>)}
  </Card>
  <Card className="space-y-4 p-5"><h2 className="font-semibold">Add or change a platform administrator</h2>
   <div className="flex gap-2"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search existing account by email"/>
    <Button variant="outline" disabled={working||search.length<3} onClick={lookup}>Search</Button></div>
   {matches.map(u=><div key={u.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
      <div><p>{u.full_name||"Account"}</p><p className="text-xs text-muted-foreground">{u.email} {u.tenant_id?"· Business account":""} {u.is_saas_admin?"· SaaS Admin":""}</p></div>
      <Button size="sm" variant="outline" onClick={()=>{setTarget(u);setConfirmEmail("");setReason("");}}>{u.is_saas_admin?"Choose to remove":"Choose to promote"}</Button>
    </div>)}
   {target&&<div className="space-y-3 rounded-md border p-4">
    <p className="font-medium">{target.is_saas_admin?"Remove SaaS Admin access":"Grant SaaS Admin access"}: {target.email}</p>
    {target.tenant_id&&<p className="text-sm text-destructive">This is a business account and cannot be promoted directly. Use a platform-only account instead.</p>}
    <div className="space-y-1"><Label htmlFor="role-confirm">Enter exact email to confirm</Label><Input id="role-confirm" value={confirmEmail} onChange={e=>setConfirmEmail(e.target.value)} autoComplete="off"/></div>
    <div className="space-y-1"><Label htmlFor="role-reason">Reason (at least 15 characters)</Label><Input id="role-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></div>
    <Button disabled={working||(!target.is_saas_admin&&!!target.tenant_id)||confirmEmail.trim().toLowerCase()!==target.email?.toLowerCase()||reason.trim().length<15} onClick={save}>Confirm and audit change</Button>
   </div>}
  </Card>
  <Card className="space-y-2 p-5"><h2 className="font-semibold">Role change history</h2>
   {(audit.data??[]).map((e:any,i:number)=><p key={i} className="border-b py-2 text-xs">{new Date(e.recorded_at).toLocaleString()} · {e.action} · {e.target_email} · {e.reason}</p>)}
  </Card>
 </div>;
}
