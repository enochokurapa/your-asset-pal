import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getPlatformActivity} from "@/lib/platform-activity.functions";
import {requestSaasEmailRecovery} from "@/lib/platform-email-recovery.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Users,ShieldCheck} from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/user-activity")({component:UserActivity});
function UserActivity(){
 const {isSaasAdmin,loading}=useAuth();
 const get=useServerFn(getPlatformActivity);
 const requestEmailChange=useServerFn(requestSaasEmailRecovery);
 const [recovering,setRecovering]=useState<{id:string;email:string;name:string}|null>(null);
 const [currentConfirm,setCurrentConfirm]=useState("");
 const [replacement,setReplacement]=useState("");
 const [busy,setBusy]=useState(false);
 const openRecovery=(u:{id:string;email:string;name:string})=>{setRecovering(u);setCurrentConfirm("");setReplacement("");};
 const submitRecovery=async()=>{
  if(!recovering||busy)return;
  setBusy(true);
  try{
   await requestEmailChange({data:{user_id:recovering.id,current_email:currentConfirm.trim().toLowerCase(),replacement_email:replacement.trim().toLowerCase()}});
   toast.success("Verification link sent to the replacement email. The current login remains unchanged until confirmed.");
   setRecovering(null);
  }catch(e:any){toast.error(e?.message||"Could not request an email change");}
  finally{setBusy(false);}
 };
 const [page,setPage]=useState(1);
 const [search,setSearch]=useState("");
 const {data,error,isLoading}=useQuery({
  queryKey:["platform-user-activity",page],enabled:isSaasAdmin,
  queryFn:async()=>get({headers:await getServerAuthHeaders(),data:{page}}),
  staleTime:60_000,
 });
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const users=(data?.users??[]).filter((u:any)=>
  (u.name+" "+u.email+" "+u.role).toLowerCase().includes(search.toLowerCase()));
 const userMap=new Map((data?.users??[]).map((u:any)=>[u.id,u.email]));
 const stamp=(v:string|null)=>v?new Date(v).toLocaleString():"No recorded activity";
 return <div className="mx-auto max-w-6xl space-y-6">
  <div className="flex items-center gap-3"><Users className="h-7 w-7 text-primary"/><div>
   <h1 className="text-2xl font-bold">User Activity & Accounts</h1>
   <p className="text-sm text-muted-foreground">Review recorded platform account activity. Events are collected only from approved system audit records; this view does not track private browsing or locations.</p>
  </div></div>
  {error&&<p role="alert" className="text-sm text-destructive">Unable to load user activity records.</p>}
  <Card className="space-y-4 p-5">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><h2 className="font-semibold">Registered users</h2><p className="text-xs text-muted-foreground">{data?.total??"…"} accounts total · 50 per page</p></div>
    <Input aria-label="Search visible users" placeholder="Search users on this page" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs"/>
   </div>
   <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
    <thead className="border-b bg-muted/40"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Account</th><th className="p-3">Last recorded activity</th><th className="p-3">Recovery</th></tr></thead>
    <tbody>{users.map((u:any)=><tr key={u.id} className="border-b last:border-0">
     <td className="p-3"><p className="font-medium">{u.name||"Not specified"}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
     <td className="p-3">{u.role||"Member"}</td>
     <td className="p-3">{u.isActive?"Active":"Disabled"}</td>
     <td className="p-3 text-muted-foreground">{stamp(u.lastActivityAt)}</td>
     <td className="p-3">{u.role!=="SaaS Admin"&&<Button size="sm" variant="outline" onClick={()=>openRecovery(u)}>Change email</Button>}</td>
    </tr>)}
    {!isLoading&&!users.length&&<tr><td colSpan={5} className="p-5 text-center">No matching users on this page.</td></tr>}
    </tbody>
   </table></div>
   <div className="flex justify-between gap-3">
    <Button variant="outline" disabled={page<=1||isLoading} onClick={()=>setPage(p=>p-1)}>Previous</Button>
    <span className="text-xs text-muted-foreground">Page {page} of {Math.max(1,Math.ceil((data?.total??0)/50))}</span>
    <Button variant="outline" disabled={isLoading||page*50>=(data?.total??0)} onClick={()=>setPage(p=>p+1)}>Next</Button>
   </div>
  </Card>
  <Card className="p-5">
   <div className="mb-4 flex items-start gap-2"><ShieldCheck className="mt-1 h-5 w-5 text-primary"/>
    <div><h2 className="font-semibold">Recent recorded actions</h2>
     <p className="text-xs text-muted-foreground">Latest recorded events for the users shown above, not a complete login history.</p></div>
   </div>
   <div className="max-h-[420px] space-y-2 overflow-y-auto">
    {(data?.events??[]).slice(0,80).map((e:any,i:number)=><div key={i} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 text-sm">
     <span className="font-medium">{userMap.get(e.actorId)||"Unknown user"}</span>
     <span>{e.action} · {e.entity}</span>
     <span className="text-xs text-muted-foreground">{stamp(e.at)}</span>
    </div>)}
    {!data?.events?.length&&<p className="text-sm text-muted-foreground">No recorded events for these users.</p>}
   </div>
  </Card>
  <Dialog open={!!recovering} onOpenChange={open=>{if(!open&&!busy)setRecovering(null)}}>
   <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Recover login email</DialogTitle><DialogDescription>The account's current email remains active until the replacement inbox verifies the change. Only SaaS Admin can request this.</DialogDescription></DialogHeader>
    <div className="space-y-4"><div className="rounded-lg border bg-muted/20 p-3"><p className="text-sm font-medium">{recovering?.name||"User"}</p><p className="break-all text-xs text-muted-foreground">Current login: {recovering?.email}</p></div>
     <div className="space-y-1.5"><Label htmlFor="confirm-current-login">Type current login email to confirm identity</Label><Input id="confirm-current-login" autoComplete="off" value={currentConfirm} onChange={e=>setCurrentConfirm(e.target.value)}/></div>
     <div className="space-y-1.5"><Label htmlFor="new-login-email">Replacement email</Label><Input id="new-login-email" type="email" autoComplete="off" placeholder="name@company.com" value={replacement} onChange={e=>setReplacement(e.target.value)}/></div>
     <p className="text-xs text-muted-foreground">A secure one-time confirmation link goes to the new mailbox. The link expires in 24 hours. After confirmation, existing sessions are signed out; the password and MFA remain unchanged.</p>
    </div><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setRecovering(null)}>Cancel</Button><Button disabled={busy||!recovering||currentConfirm.trim().toLowerCase()!==recovering.email.toLowerCase()||!/^\S+@\S+\.\S+$/.test(replacement)||replacement.trim().toLowerCase()===recovering.email.toLowerCase()} onClick={submitRecovery}>{busy?"Sending…":"Send verification link"}</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
