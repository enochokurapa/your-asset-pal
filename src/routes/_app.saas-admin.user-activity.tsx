import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getPlatformActivity} from "@/lib/platform-activity.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Users,ShieldCheck} from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/user-activity")({component:UserActivity});
function UserActivity(){
 const {isSaasAdmin,loading}=useAuth();
 const get=useServerFn(getPlatformActivity);
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
    <thead className="border-b bg-muted/40"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Account</th><th className="p-3">Last recorded activity</th></tr></thead>
    <tbody>{users.map((u:any)=><tr key={u.id} className="border-b last:border-0">
     <td className="p-3"><p className="font-medium">{u.name||"Not specified"}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
     <td className="p-3">{u.role||"Member"}</td>
     <td className="p-3">{u.isActive?"Active":"Disabled"}</td>
     <td className="p-3 text-muted-foreground">{stamp(u.lastActivityAt)}</td>
    </tr>)}
    {!isLoading&&!users.length&&<tr><td colSpan={4} className="p-5 text-center">No matching users on this page.</td></tr>}
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
 </div>;
}
