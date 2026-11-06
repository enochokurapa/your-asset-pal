import {createFileRoute,Navigate,Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getTrafficAnalytics} from "@/lib/platform-traffic.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {BarChart3,Globe2,MousePointerClick,Layers} from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/traffic")({component:TrafficAnalyticsPage});
function TrafficAnalyticsPage(){
 const {isSaasAdmin,loading}=useAuth();
 const get=useServerFn(getTrafficAnalytics);
 const {data,isLoading,error,refetch,isFetching}=useQuery({queryKey:["platform-traffic"],enabled:isSaasAdmin,
   queryFn:async()=>get({headers:await getServerAuthHeaders()}),staleTime:60_000});
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const total=(data?.totals.website||0)+(data?.totals.application||0);
 return <div className="mx-auto max-w-6xl min-w-0 space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl"><BarChart3 className="h-5 w-5 text-[#ba6b3c]"/>Visitor & traffic analytics</h1>
    <p className="mt-1 text-sm text-muted-foreground">Website and signed-in application page views, referral channels and top pages.</p></div>
   <Button variant="outline" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Refreshing…":"Refresh"}</Button>
  </div>
  {isLoading&&<p className="text-sm text-muted-foreground">Loading traffic metrics…</p>}
  {error&&<p className="text-sm text-destructive">Traffic analytics unavailable. Check your administrator access.</p>}
  {data&&<>
   <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
    {[{label:"Website page views",value:data.totals.website,icon:Globe2},
      {label:"App page views",value:data.totals.application,icon:Layers},
      {label:"Total recorded page views",value:total,icon:MousePointerClick}].map(({label,value,icon:Icon})=>
     <Card key={label} className="min-w-0 p-4 sm:p-5"><Icon className="h-5 w-5 text-[#bd7044]"/>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 break-words text-xs text-muted-foreground">{label}</p></Card>)}
   </div>
   <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <Card className="min-w-0 p-4 sm:p-5"><h2 className="font-semibold">Visitors by traffic source</h2>
      <p className="mt-1 text-xs text-muted-foreground">Search, social, campaign, referral, direct and internal sources for the last 30 days.</p>
      <div className="mt-4 space-y-3">{data.sources.map(s=>
       <div key={s.area+":"+s.source} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
        <span className="capitalize">{s.area} · {s.source}</span><strong className="tabular-nums">{s.views.toLocaleString()}</strong>
       </div>)}{!data.sources.length&&<p className="text-sm text-muted-foreground">No source data recorded yet.</p>}</div>
    </Card>
    <Card className="min-w-0 p-4 sm:p-5"><h2 className="font-semibold">Most visited pages</h2>
      <p className="mt-1 text-xs text-muted-foreground">Page paths only; query strings and individual identities are not stored.</p>
      <div className="mt-4 space-y-3">{data.pages.map(p=>
       <div key={p.area+":"+p.page} className="flex min-w-0 items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
        <span className="min-w-0 break-all">{p.area}: {p.page}</span><strong className="shrink-0 tabular-nums">{p.views.toLocaleString()}</strong>
       </div>)}{!data.pages.length&&<p className="text-sm text-muted-foreground">No visits recorded yet.</p>}</div>
    </Card>
   </div>
   <Card className="min-w-0 p-4 sm:p-5"><h2 className="font-semibold">Daily trend · last 30 days</h2>
    <div className="mt-4 space-y-2">{data.daily.map(d=>
      <div key={d.day+":"+d.area} className="flex min-w-0 items-center gap-3 text-xs">
       <span className="w-[110px] shrink-0">{d.day} · {d.area==="website"?"Web":"App"}</span>
       <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e8eff1]">
        <div className="h-full bg-[#b86b3b]" style={{width:`${Math.min(100,Math.max(2,d.views/Math.max(1,...data.daily.map(x=>x.views))*100))}%`}}/>
       </div><span className="w-12 shrink-0 text-right tabular-nums">{d.views.toLocaleString()}</span>
      </div>)}{!data.daily.length&&<p className="text-sm text-muted-foreground">Tracking begins after deployment.</p>}</div>
   </Card>
   <p className="text-xs leading-5 text-muted-foreground">{data.note} Counts can include automated traffic and are not unique human visitors. Do Not Track and Global Privacy Control signals are respected in the browser collector. For stronger bot filtering and attribution, integrate Cloudflare analytics later.</p>
   <Button asChild variant="outline" size="sm"><Link to="/saas-admin/statistics">Configure Live, Manual and Hybrid counters</Link></Button>
  </>}
 </div>;
}
