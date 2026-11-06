import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock3, Mail, ShieldCheck, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { getTenantOperationsAnalytics } from "@/lib/tenant-operations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/_app/diagnostics")({component:DiagnosticsPage});

function DiagnosticsPage(){
  const {isTenantAdmin,loading}=useAuth();
  const getter=useServerFn(getTenantOperationsAnalytics);
  const {data,isLoading,error,isFetching,refetch}=useQuery({
    queryKey:["tenant-operations-analytics"],enabled:isTenantAdmin,
    queryFn:async()=>getter({headers:await getServerAuthHeaders()}),
    staleTime:60_000,
  });
  if(loading)return null;
  if(!isTenantAdmin)return <Navigate to="/dashboard"/>;
  const m=data?.metrics;
  const findings=m?[
    {label:"Overdue asset renewals",value:m.overdueVerifications,detail:"Assets past their verification renewal date. Inspect and record their actual condition.",to:"/verification" as const},
    {label:"Renewals due within 30 days",value:m.upcomingVerifications,detail:"Schedule verification visits before these assets become overdue.",to:"/verification" as const},
    {label:"Approval requests waiting",value:m.pendingApprovals,detail:"Review approvals that have not been decided.",to:"/audit" as const},
    {label:"Failed payment requests",value:m.failedPayments30Days,detail:"Transactions marked failed within the last 30 days. Review the payment history before retrying.",to:"/billing" as const},
    {label:"Old pending payment requests",value:m.stalePendingPayments,detail:"Transactions pending for over an hour. Check their provider status; do not pay twice.",to:"/billing" as const},
  ]:[];
  const configured=data?.verificationEmails;
  const mailNeedsSetup=!configured?.enabled||!configured?.recipients;
  const lastRun=configured?.lastCheckedAt?new Date(configured.lastCheckedAt):null;
  const lastRunValid=Boolean(lastRun&&!Number.isNaN(lastRun.valueOf()));
  const lateRun=Boolean(configured?.enabled&&lastRunValid&&Date.now()-(lastRun?.getTime()||0)>48*3600_000);
  return <div className="mx-auto max-w-6xl min-w-0 space-y-6">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Organisation diagnostics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Operational warnings, renewal checks and suggested troubleshooting actions.</p></div>
      <Button variant="outline" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Refreshing…":"Refresh checks"}</Button>
    </div>
    {error&&<Card className="border-destructive/50 p-4 text-sm text-destructive">Unable to retrieve diagnostics. Check your sign-in or try again.</Card>}
    {isLoading&&<p className="text-sm text-muted-foreground">Inspecting your organisation's recorded data…</p>}
    {m&&<>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="min-w-0 p-4"><p className="text-xs text-muted-foreground">Warnings raised</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{findings.filter(f=>f.value>0).length}</p></Card>
        <Card className="min-w-0 p-4"><p className="text-xs text-muted-foreground">Assets tracked</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{m.assets.toLocaleString()}</p></Card>
        <Card className="min-w-0 p-4"><p className="text-xs text-muted-foreground">Audit events, 30 days</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{m.activity30Days.toLocaleString()}</p></Card>
      </div>
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Checks and recommended actions</h2>
        {findings.map(f=><Card key={f.label} className="min-w-0 p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            {f.value>0?<AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"/>:
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"/>}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{f.label} — {f.value.toLocaleString()}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{f.detail}</p>
            </div>
            <Button asChild variant="outline" size="sm"><Link to={f.to}>Review</Link></Button>
          </div>
        </Card>)}
      </div>
      <Card className="min-w-0 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Mail className="h-4 w-4 text-[#bd7044]"/>Verification reminder configuration</h2>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          {mailNeedsSetup?<AlertTriangle className="h-5 w-5 text-amber-600"/>:lateRun?<Clock3 className="h-5 w-5 text-amber-600"/>:
            <ShieldCheck className="h-5 w-5 text-emerald-600"/>}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{mailNeedsSetup?"Email reminders are not fully configured":lateRun?"Reminder scheduler may be delayed":"Reminder scheduler is configured"}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {configured?.enabled?"Enabled":"Disabled"} · {configured?.recipients??0} recipient(s) ·
              {lastRunValid?` Last recorded check: ${lastRun!.toLocaleString()}`:" No recorded scheduler check"}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Configuration and last-run time do not prove that emails were delivered. Check the SMTP test and delivery logs if notices do not arrive.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/settings">Open organisation settings</Link></Button>
      </Card>
      <Card className="min-w-0 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Wrench className="h-4 w-4 text-[#bd7044]"/>Additional investigation</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          These checks cover existing database records. Browser crashes, provider outages, undelivered messages,
          slow queries and authentication failures require separate application and infrastructure telemetry.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/audit">View recorded audit trail</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/analytics">View analytics</Link></Button>
        </div>
      </Card>
    </>}
  </div>;
}
