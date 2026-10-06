import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSaasAdminDashboard } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity, ArrowRight, Boxes, Building2, CheckCircle2, CircleDollarSign,
  CreditCard, Database, DatabaseBackup, Globe2, ImageIcon, Settings2,
  ShieldCheck, Users, Wrench, XCircle,
} from "lucide-react";

const SECTIONS = [
  { to: "/saas-admin/organizations", title: "Businesses", description: "Open one organization and control plan, modules, users, domains and activity.", icon: Building2 },
  { to: "/saas-admin/branding", title: "Branding", description: "Platform logo, app icon and AssetFlow 360 color palette.", icon: ImageIcon },
  { to: "/saas-admin/policy", title: "Plan & Pricing", description: "Trial duration, trial user limits, paid price and currency.", icon: CreditCard },
  { to: "/saas-admin/modules", title: "Global Modules", description: "Control included modules and optional paid add-ons.", icon: Boxes },
  { to: "/saas-admin/backups", title: "Backup & Restore", description: "R2 backup automation, restore points and manual backups.", icon: DatabaseBackup },
] as const;

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: any }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
        {ok ? "Ready" : "Needs setup"}
      </span>
    </div>
  );
}

export function SaasAdminOverview() {
  const { isSaasAdmin } = useAuth();
  const getDashboard = useServerFn(getSaasAdminDashboard);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["saas-admin-dashboard"],
    queryFn: async () => {
      const headers = await getServerAuthHeaders();
      return getDashboard({ headers });
    },
    enabled: isSaasAdmin,
  });

  const summary = data?.summary;
  const policy = data?.policy;
  const technical = data?.technical;
  const currency = policy?.currency || "UGX";
  const format = (value: number | undefined) => Number(value || 0).toLocaleString();

  return (
    <div className="platform-brand space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">SaaS Control Center</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Business performance, tenant controls, platform branding and technical readiness in one place.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <Activity className="mr-2 h-4 w-4" /> Refresh insights
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message || "The SaaS dashboard could not be loaded."}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Organizations" value={isLoading ? "-" : summary?.organizations ?? 0} detail={`${summary?.active ?? 0} active · ${summary?.trials ?? 0} trials`} icon={Building2} />
        <MetricCard label="Business users" value={isLoading ? "-" : summary?.users ?? 0} detail={`${summary?.newWorkspaces30d ?? 0} new workspaces in 30 days`} icon={Users} />
        <MetricCard label="Managed assets" value={isLoading ? "-" : format(summary?.assets)} detail={`${format(summary?.assetsAdded30d)} added in the last 30 days`} icon={Boxes} />
        <MetricCard label="Successful billing" value={isLoading ? "-" : `${currency} ${format(summary?.successfulRevenue)}`} detail={`Current paid price: ${currency} ${format(policy?.paidPrice)}`} icon={CircleDollarSign} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-semibold">Business insights</h2>
              <p className="text-sm text-muted-foreground">Latest organization usage and account state.</p>
            </div>
            <Button asChild size="sm">
              <Link to="/saas-admin/organizations">Manage businesses <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>

          {!data?.tenants?.length ? (
            <p className="p-6 text-sm text-muted-foreground">No organizations are available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Business</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3 text-right">Users</th>
                    <th className="px-4 py-3 text-right">Assets</th>
                    <th className="px-4 py-3 text-right">Branches</th>
                    <th className="px-5 py-3">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.slice(0, 8).map((tenant: any) => (
                    <tr key={tenant.id} className="border-b last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-semibold">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize">{tenant.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{tenant.users}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{tenant.assets}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{tenant.branches}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {tenant.lastActivityAt ? new Date(tenant.lastActivityAt).toLocaleString() : "No activity yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Database className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold">Technical readiness</h2>
              <p className="text-sm text-muted-foreground">Production services used by the SaaS.</p>
            </div>
          </div>

          <div className="mt-4">
            <HealthRow label="Database & tenant RLS" ok={technical?.database === "operational"} detail="Tenant-scoped application database" />
            <HealthRow label="Authentication proxy" ok={!!technical?.authProxyConfigured} detail="GoTrue sign-in and signup proxy" />
            <HealthRow label="REST API proxy" ok={!!technical?.restProxyConfigured} detail="PostgREST data access path" />
            <HealthRow label="Payment gateway" ok={!!technical?.paymentConfigured} detail="Paid-plan collection configuration" />
            <HealthRow label="Cloud backup storage" ok={!!technical?.r2Configured} detail="Cloudflare R2 backup destination" />
          </div>

          <div className="mt-4 rounded-xl border bg-muted/25 p-4">
            <div className="flex items-center gap-2"><DatabaseBackup className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Backup policy</p></div>
            <p className="mt-1 text-xs text-muted-foreground">
              {technical?.backupEnabled ? `Automatic backup every ${technical.backupIntervalHours} hours.` : "Automatic backups are currently disabled."}
            </p>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-base font-semibold">Platform controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">Open a focused admin area without mixing business settings into the sidebar.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.to} to={section.to} className="group block">
                <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-4 font-semibold">{section.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{section.description}</p>
                  <span className="mt-4 inline-flex items-center text-xs font-semibold text-primary">Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></span>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
