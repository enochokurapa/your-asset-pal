import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Building2, Package, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getPlatformOperationsAnalytics } from "@/lib/tenant-operations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/_app/saas-admin/analytics")({component:PlatformAnalyticsPage});
function PlatformAnalyticsPage(){
  const {isSaasAdmin,loading}=useAuth();
  const getter=useServerFn(getPlatformOperationsAnalytics);
  const {data,isLoading,isFetching,error,refetch}=useQuery({
    queryKey:["platform-operations-analytics"],enabled:isSaasAdmin,
    queryFn:()=>getter({headers:await getServerAuthHeaders()}),
    staleTime:60_000,
  });
  if(loading)return null;
  if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
  const organisations=data?.organisations||[];
  const totals=organisations.reduce((a,r)=>({
    assets:a.assets+r.assets, users:a.users+r.active_users,
    events:a.events+r.events30Days, overdue:a.overdue+r.overdue_verifications,
  }),{assets:0,users:0,events:0,overdue:0});
  const indicators=[
    {label:"Organisations",value:organisations.length,icon:Building2},
    {label:"Assets registered",value:totals.assets,icon:Package},
    {label:"Active accounts",value:totals.users,icon:Users},
    {label:"Recorded events (30d)",value:totals.events,icon:Activity},
    {label:"Overdue renewals",value:totals.overdue,icon:AlertTriangle},
  ];
  return <div className="mx-auto max-w-6xl min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Platform operations analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organisation-level totals and audit activity across AssetFlow.</p></div>
      <Button variant="outline" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Refreshing…":"Refresh"}</Button>
    </div>
    {isLoading&&<p className="text-sm text-muted-foreground">Loading organisation metrics…</p>}
    {error&&<Card className="border-destructive/40 p-4 text-sm text-destructive">Platform analytics could not be loaded.</Card>}
    {data&&<>
      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {indicators.map(({label,value,icon:Icon})=><Card className="min-w-0 p-3 sm:p-4" key={label}>
          <Icon className="h-4 w-4 text-[#bd7044]" aria-hidden="true"/>
          <p className="mt-3 text-xl font-semibold tabular-nums sm:text-2xl">{value.toLocaleString()}</p>
          <p className="mt-1 break-words text-xs leading-4 text-muted-foreground">{label}</p>
        </Card>)}
      </div>
      <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
        <h2 className="text-base font-semibold">Organisations and their operations</h2>
        <p className="mt-1 text-xs text-muted-foreground">Aggregated counts; no tenant passwords, billing credentials or personal audit details are included.</p>
        <div className="mt-4 w-full overflow-x-auto">
          <table className="w-full min-w-[660px] text-left text-sm">
            <thead className="border-b bg-muted/35 text-xs text-muted-foreground">
              <tr><th className="p-3">Organisation</th><th className="p-3">Status</th><th className="p-3 text-right">Assets</th><th className="p-3 text-right">Active users</th><th className="p-3 text-right">Activity (30d)</th><th className="p-3 text-right">Overdue</th></tr>
            </thead>
            <tbody>{organisations.map(r=><tr key={r.id} className="border-b last:border-none">
              <td className="max-w-[240px] break-words p-3 font-medium">{r.name}</td>
              <td className="p-3 capitalize">{r.subscription_status}</td>
              <td className="p-3 text-right tabular-nums">{r.assets.toLocaleString()}</td>
              <td className="p-3 text-right tabular-nums">{r.active_users.toLocaleString()}</td>
              <td className="p-3 text-right tabular-nums">{r.events30Days.toLocaleString()}</td>
              <td className="p-3 text-right tabular-nums">{r.overdue_verifications.toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
          {!organisations.length&&<p className="py-5 text-sm text-muted-foreground">No organisations found.</p>}
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">The overview currently returns up to {data.limitedTo} organisations. Activity reflects instrumented audit events; full sign-in, payment-provider and performance telemetry requires separate integrations.</p>
    </>}
  </div>;
}
