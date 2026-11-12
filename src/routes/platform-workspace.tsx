import {createFileRoute,Navigate,Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getPlatformStaffOverview} from "@/lib/platform-staff-rbac.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {ShieldCheck,LogOut} from "lucide-react";

export const Route=createFileRoute("/platform-workspace")({component:PlatformStaffWorkspace});
function PlatformStaffWorkspace(){
 const {user,loading,platformStaffRole,isSaasAdmin,signOut}=useAuth();
 const get=useServerFn(getPlatformStaffOverview);
 const allowed=!!(isSaasAdmin||platformStaffRole);
 const overview=useQuery({queryKey:["platform-staff-overview",user?.id],queryFn:async()=>get({headers:await getServerAuthHeaders()}),
 enabled:!loading&&!!user&&allowed,retry:false,refetchInterval:60000});
 if(loading)return <div className="p-8">Checking permissions…</div>;
 if(!user)return <Navigate to="/login"/>;
 if(!allowed)return <Navigate to="/dashboard"/>;
 const d=overview.data;
 return <div className="min-h-screen bg-background">
  <header className="border-b p-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary"/><div>
    <h1 className="font-bold">AssetFlow 360 · Platform Workspace</h1>
    <p className="text-xs text-muted-foreground">Signed in as {user.email} · Role: {d?.role||platformStaffRole||"SaaS Admin"}</p>
   </div></div>
   <div className="flex items-center gap-2">{isSaasAdmin&&<Button asChild variant="outline"><Link to="/dashboard">SaaS Control Center</Link></Button>}
    <Button variant="outline" onClick={signOut}><LogOut className="mr-1 h-4 w-4"/>Sign out</Button></div>
  </div></header>
  <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-7">
   <div><h2 className="text-2xl font-bold">Platform {String(d?.role||platformStaffRole||"Staff").replace("_"," ")} Dashboard</h2>
    <p className="text-sm text-muted-foreground">Your available information is limited to permissions assigned by a SaaS Administrator. Customer records and administrative secrets are not accessible here.</p></div>
   {overview.error&&<Card className="p-5 text-destructive">Unable to load this workspace. Contact your SaaS Administrator.</Card>}
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {([{key:"tenantCount",label:"Registered businesses"},
       {key:"activeUsers",label:"Active users"},
       {key:"assets",label:"Assets across businesses"},
       {key:"failedPayments30Days",label:"Failed billing transactions (30 days)"}] as const).filter(x=>d&&x.key in d).map(x=><Card key={x.key} className="p-5">
        <p className="text-sm text-muted-foreground">{x.label}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">{(d as any)[x.key]}</p>
       </Card>)}
   </div>
   <Card className="p-5"><h3 className="font-semibold">Access policy</h3><p className="mt-2 text-sm text-muted-foreground">Finance, Support, Operations and Viewer are distinct platform staff roles. Only the SaaS Admin can manage platform users, initiate direct tenant sessions or modify protected settings.</p></Card>
  </main>
 </div>;
}
