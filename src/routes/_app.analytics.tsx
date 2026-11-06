import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowUpRight, ChartNoAxesColumnIncreasing, ClipboardCheck, FileClock, Package, Route, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getTenantOperationsAnalytics } from "@/lib/tenant-operations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/analytics")({component:AnalyticsPage});
function AnalyticsPage(){
  const {isTenantAdmin,loading}=useAuth();
  const get=useServerFn(getTenantOperationsAnalytics);
  const {data,isLoading,error,refetch,isFetching}=useQuery({
    queryKey:["tenant-operations-analytics"],
    enabled:isTenantAdmin,
    queryFn:async()=>get({headers:await getServerAuthHeaders()}),
    staleTime:60_000,
  });
  if(loading)return null;
  if(!isTenantAdmin)return <Navigate to="/dashboard"/>;
  const metrics=data?.metrics;
  const cards=[
    {label:"Assets managed",value:metrics?.assets,icon:Package,detail:"Current registered assets"},
    {label:"Assets added",value:metrics?.assetsAdded30Days,icon:ArrowUpRight,detail:"Last 30 days"},
    {label:"Recorded activity",value:metrics?.activity30Days,icon:Activity,detail:"Audit events, last 30 days"},
    {label:"Active operators",value:metrics?.activeActors30Days,icon:Users,detail:"Distinct recorded users, 30 days"},
    {label:"Asset movements",value:metrics?.movements30Days,icon:Route,detail:"Last 30 days"},
    {label:"Pending approvals",value:metrics?.pendingApprovals,icon:ClipboardCheck,detail:"Awaiting a decision"},
  ];
  const maximum=Math.max(1,...(data?.daily||[]).map(row=>row.events));
  return <div className="mx-auto max-w-6xl min-w-0 space-y-6">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Organisation analytics</h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">Operations and recorded activity across {data?.name||"your organisation"}.</p></div>
      <Button variant="outline" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Refreshing…":"Refresh"}</Button>
    </div>
    {error&&<Card className="border-destructive/40 p-5 text-sm text-destructive">Analytics could not be loaded. Check your session or try again.</Card>}
    {isLoading&&<p className="text-sm text-muted-foreground">Loading your organisation's activity…</p>}
    {metrics&&<div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map(({label,value,icon:Icon,detail})=><Card key={label} className="min-w-0 p-3 sm:p-5">
        <Icon aria-hidden="true" className="h-4 w-4 text-[#bd7044]"/>
        <p className="mt-3 break-words text-xl font-semibold tabular-nums text-[#294450] sm:text-2xl">{(value||0).toLocaleString()}</p>
        <p className="mt-1 break-words text-xs font-semibold sm:text-sm">{label}</p>
        <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </Card>)}
    </div>}
    {data&&<div className="grid min-w-0 gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center gap-2"><ChartNoAxesColumnIncreasing className="h-4 w-4 text-[#bd7044]"/><h2 className="text-base font-semibold">Activity trend</h2></div>
        <p className="mt-1 text-xs text-muted-foreground">Audit events recorded over the last 14 days.</p>
        <div className="mt-5 space-y-3">{data.daily.length?data.daily.map(row=>
          <div key={row.day} className="flex min-w-0 items-center gap-2.5">
            <span className="w-[76px] shrink-0 text-[11px] text-muted-foreground">{row.day.slice(5)}</span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e7eef0]">
              <div className="h-full rounded-full bg-[#bf794f]" style={{width:`${Math.max(3,row.events/maximum*100)}%`}}/>
            </div>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums">{row.events.toLocaleString()}</span>
          </div>):<p className="text-sm text-muted-foreground">No activity was recorded in this period.</p>}</div>
      </Card>
      <Card className="min-w-0 p-4 sm:p-5">
        <h2 className="text-base font-semibold">Most frequent operations</h2>
        <p className="mt-1 text-xs text-muted-foreground">Grouped from the existing tenant audit trail.</p>
        <ul className="mt-4 space-y-3">{data.categories.length?data.categories.slice(0,8).map((c,i)=>
          <li key={c.entity_type+":"+c.action} className="flex min-w-0 items-start justify-between gap-3 border-b pb-2 text-xs last:border-none">
            <span className="min-w-0 break-words leading-5">{i+1}. {c.entity_type.replace(/_/g," ")} · {c.action.replace(/_/g," ")}</span>
            <span className="shrink-0 font-semibold tabular-nums">{c.events.toLocaleString()}</span>
          </li>):<li className="text-sm text-muted-foreground">No operations recorded yet.</li>}</ul>
      </Card>
    </div>}
    {data&&<Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><FileClock className="h-4 w-4 text-[#bd7044]"/><h2 className="text-base font-semibold">Recent audit events</h2></div>
        <Button asChild size="sm" variant="outline"><Link to="/audit">Open full audit trail</Link></Button>
      </div>
      <ul className="mt-4 divide-y">
        {data.recent.map(row=><li key={row.created_at+row.entity_type+row.action} className="flex min-w-0 flex-wrap justify-between gap-2 py-2.5 text-xs">
          <span className="min-w-0 break-words font-medium">{row.entity_type.replace(/_/g," ")} · {row.action.replace(/_/g," ")}</span>
          <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
        </li>)}
        {!data.recent.length&&<li className="py-2 text-sm text-muted-foreground">No recorded events.</li>}
      </ul>
    </Card>}
    <p className="text-xs text-muted-foreground">These statistics summarise recorded events. Actions that have not been instrumented in the audit trail cannot yet be counted.</p>
  </div>;
}
