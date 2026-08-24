import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  getSaasContext,
  listSaasModules,
  listSaasTenants,
  updateSaasModule,
  updateSaasSettings,
  updateTenantSubscription,
} from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Save, Boxes, Building2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/saas-admin")({ component: SaasAdminPage });

type SettingsForm = {
  trial_days: number;
  trial_user_limit: number;
  paid_price: number;
  currency: string;
};

function SaasAdminPage() {
  const { isSaasAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const getCtx = useServerFn(getSaasContext);
  const listModules = useServerFn(listSaasModules);
  const listTenants = useServerFn(listSaasTenants);
  const saveSettings = useServerFn(updateSaasSettings);
  const saveModule = useServerFn(updateSaasModule);
  const saveTenant = useServerFn(updateTenantSubscription);
  const [savingSettings, setSavingSettings] = useState(false);
  const [form, setForm] = useState<SettingsForm>({ trial_days: 28, trial_user_limit: 4, paid_price: 0, currency: "UGX" });

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data: ctx } = useQuery({
    queryKey: ["saas-context"],
    queryFn: () => authCall(getCtx),
    enabled: isSaasAdmin,
  });
  const { data: modules = [], refetch: refetchModules } = useQuery({
    queryKey: ["saas-admin-modules"],
    queryFn: () => authCall(listModules),
    enabled: isSaasAdmin,
  });
  const { data: tenants = [], refetch: refetchTenants } = useQuery({
    queryKey: ["saas-admin-tenants"],
    queryFn: () => authCall(listTenants),
    enabled: isSaasAdmin,
  });

  useEffect(() => {
    if (!ctx?.settings) return;
    setForm({
      trial_days: Number(ctx.settings.trialDays ?? 28),
      trial_user_limit: Number(ctx.settings.trialUserLimit ?? 4),
      paid_price: Number(ctx.settings.paidPrice ?? 0),
      currency: ctx.settings.currency ?? "UGX",
    });
  }, [ctx]);

  if (loading) return null;
  if (!isSaasAdmin) return <Navigate to="/dashboard" />;

  const updateSettings = async () => {
    setSavingSettings(true);
    try {
      await authCall(saveSettings, { data: form });
      toast.success("SaaS settings saved");
      await qc.invalidateQueries({ queryKey: ["saas-context"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save SaaS settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleModule = async (m: any, field: "globally_enabled" | "trial_enabled" | "paid_enabled", value: boolean) => {
    try {
      await authCall(saveModule, {
        data: {
          module_key: m.module_key,
          globally_enabled: field === "globally_enabled" ? value : !!m.globally_enabled,
          trial_enabled: field === "trial_enabled" ? value : !!m.trial_enabled,
          paid_enabled: field === "paid_enabled" ? value : !!m.paid_enabled,
        },
      });
      await refetchModules();
      await qc.invalidateQueries({ queryKey: ["saas-context"] });
      toast.success(`${m.label} updated`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update module");
    }
  };

  const changeTenantStatus = async (tenant: any, status: "trial" | "active" | "expired" | "suspended") => {
    try {
      await authCall(saveTenant, { data: { tenant_id: tenant.id, status, plan_code: status === "active" ? "paid" : "trial" } });
      await refetchTenants();
      toast.success(`${tenant.name} is now ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update organization");
    }
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">SaaS Administration</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Platform-level controls. Regular admins cannot access this page.</p>
        </div>
        <Badge>SaaS Admin</Badge>
      </div>

      <Card className="space-y-5 p-6">
        <div><h2 className="font-semibold">Plan policy & pricing</h2><p className="text-sm text-muted-foreground">These values apply platform-wide. Payment credentials remain server-side and are added only when deployment is ready.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2"><Label>Trial days</Label><Input type="number" min={1} max={365} value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Trial user limit</Label><Input type="number" min={1} value={form.trial_user_limit} onChange={(e) => setForm({ ...form, trial_user_limit: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Paid price</Label><Input type="number" min={0} value={form.paid_price} onChange={(e) => setForm({ ...form, paid_price: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={8} /></div>
        </div>
        <Button onClick={updateSettings} disabled={savingSettings}><Save className="mr-2 h-4 w-4" />{savingSettings ? "Saving…" : "Save policy & price"}</Button>
      </Card>

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">Module control</h2><p className="text-sm text-muted-foreground">Global OFF wins over all workspace and user permissions. Admins may only grant users access to modules the SaaS platform allows. Trial-disabled modules stay visible as paid features.</p></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">Module</th><th className="px-3 py-2 text-center">Platform</th><th className="px-3 py-2 text-center">Free trial</th><th className="px-3 py-2 text-center">Paid</th></tr></thead>
            <tbody>{modules.map((m: any) => <tr key={m.module_key} className="border-b last:border-0"><td className="py-3 pr-4"><p className="font-medium">{m.label}</p><p className="text-xs text-muted-foreground">{m.module_key}</p></td><td className="px-3 text-center"><div className="flex justify-center"><Switch checked={!!m.globally_enabled} onCheckedChange={(v) => toggleModule(m, "globally_enabled", v)} /></div></td><td className="px-3 text-center"><div className="flex justify-center"><Switch checked={!!m.trial_enabled} disabled={!m.globally_enabled} onCheckedChange={(v) => toggleModule(m, "trial_enabled", v)} /></div></td><td className="px-3 text-center"><div className="flex justify-center"><Switch checked={!!m.paid_enabled} disabled={!m.globally_enabled} onCheckedChange={(v) => toggleModule(m, "paid_enabled", v)} /></div></td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">Organizations</h2><p className="text-sm text-muted-foreground">Subscription state is controlled here or automatically after a confirmed payment.</p></div></div><Button variant="outline" size="sm" onClick={() => refetchTenants()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
        <div className="space-y-3">
          {tenants.length === 0 ? <p className="text-sm text-muted-foreground">No organizations found.</p> : tenants.map((t: any) => (
            <div key={t.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{t.name}</p><Badge variant="outline" className="capitalize">{t.subscription_status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{t.slug} · Trial ends {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString() : "—"}</p></div>
              <div className="w-full md:w-48"><Select value={t.subscription_status} onValueChange={(v) => changeTenantStatus(t, v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">Trial</SelectItem><SelectItem value="active">Active / Paid</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
