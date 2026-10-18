import type { ExportCapability } from "@/lib/export-permissions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSaasAdminDashboard,
  getSaasTenantDetail,
  updateSaasTenantName,
  updateTenantModule,
  updateTenantSubscription,assignTenantPricingPlan,
  updateTenantControls,
  updateSaasTenantUserStatus,
  getSaasTenantTagSettings,
  updateSaasTenantTagSettings,
} from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Boxes, Building2, CreditCard, Globe2, RefreshCw, Search,
  ShieldCheck, Users, WalletCards,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/organizations")({
  component: SaasAdminOrganizationsPage,
});

function SmallMetric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-bold tabular-nums">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function SaasAdminOrganizationsPage() {
  const { isSaasAdmin } = useAuth();
  const qc = useQueryClient();
  const getDashboard = useServerFn(getSaasAdminDashboard);
  const getDetail = useServerFn(getSaasTenantDetail);
  const saveTenant = useServerFn(updateTenantSubscription);
  const assignPlan=useServerFn(assignTenantPricingPlan);
  const saveNameFn = useServerFn(updateSaasTenantName);
  const saveModule = useServerFn(updateTenantModule);
  const saveUserStatus = useServerFn(updateSaasTenantUserStatus);
  const saveControls = useServerFn(updateTenantControls);
  const getTags=useServerFn(getSaasTenantTagSettings);
  const setTags=useServerFn(updateSaasTenantTagSettings);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const exportCapabilities: Array<{key:ExportCapability,label:string}> = [
    {key:"register",label:"Register Excel exports"},
    {key:"template",label:"Import and update templates"},
    {key:"reports",label:"Reports (Excel / PDF)"},
    {key:"documents",label:"Document and depreciation downloads"},
    {key:"other",label:"Other downloads"},
  ];
  const exportQuery=useQuery({
    queryKey:["saas-tenant-export-controls",selectedTenantId],
    enabled:!!selectedTenantId&&isSaasAdmin,
    queryFn:async()=>{
      const {data,error}=await supabase.rpc("saas_list_tenant_export_controls" as any,{p_tenant:selectedTenantId});
      if(error)throw new Error(error.message);
      return (data??{}) as Record<string,boolean>;
    }
  });
  const [exportSaving,setExportSaving]=useState<string|null>(null);
  const changeExport=async(key:ExportCapability, setting:string)=>{
    if(!selectedTenantId)return;
    setExportSaving(key);
    try{
      const {error}=await supabase.rpc("saas_set_tenant_export_control" as any,{
        p_tenant:selectedTenantId,p_capability:key,p_setting:setting,
      });
      if(error)throw new Error(error.message);
      await exportQuery.refetch();
      toast.success("Download access updated");
    }catch(e:any){toast.error(e?.message||"Could not update download permissions");}
    finally{setExportSaving(null);}
  };
  const [tagPrefix,setTagPrefix]=useState("AST");
  const [tagSeparator,setTagSeparator]=useState("-");
  const [tagDigits,setTagDigits]=useState(5);
  const [tagSaving,setTagSaving]=useState(false);
  const [trialDays,setTrialDays] = useState("");
  const [seatLimit,setSeatLimit] = useState("");
  const [priceOverride,setPriceOverride] = useState("");
  const [savingControls,setSavingControls] = useState(false);

  const [search, setSearch] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const dashboardQuery = useQuery({
    queryKey: ["saas-admin-dashboard"],
    queryFn: async () => { const {data,error}=await supabase.rpc("admin_control_center" as any);if(error)throw new Error(error.message);if(!data||!Array.isArray((data as any).tenants))throw new Error("Businesses service returned invalid data");return data as any; },
    enabled: isSaasAdmin,
  });

  const tenants = Array.isArray(dashboardQuery.data?.tenants) ? dashboardQuery.data.tenants : [];
  useEffect(() => {
    if (!tenants.length) { setSelectedTenantId(null); return; }
    if (!selectedTenantId || !tenants.some((item: any) => item.id === selectedTenantId)) setSelectedTenantId(tenants[0].id);
  }, [selectedTenantId, tenants]);

  const detailQuery = useQuery({
    queryKey: ["saas-admin-tenant-detail", selectedTenantId],
    queryFn: async () => { const {data,error}=await supabase.rpc("admin_business_detail" as any,{p_tenant:selectedTenantId});if(error)throw new Error(error.message);if(!data||typeof data!=="object"||!(data as any).tenant||!Array.isArray((data as any).modules)||!Array.isArray((data as any).users))throw new Error("Business controls response is incomplete");return data as any; },
    enabled: !!selectedTenantId && isSaasAdmin,
  });

  const tagQuery=useQuery({queryKey:["saas-tenant-asset-tags",selectedTenantId],enabled:!!selectedTenantId&&isSaasAdmin,queryFn:()=>authCall(getTags,{data:{tenant_id:selectedTenantId}})});
  useEffect(()=>{if(!tagQuery.data)return;setTagPrefix(tagQuery.data.prefix);setTagSeparator(tagQuery.data.separator);setTagDigits(tagQuery.data.padding)},[tagQuery.data]);
  const persistTags=async()=>{if(!selectedTenantId)return;setTagSaving(true);try{await authCall(setTags,{data:{tenant_id:selectedTenantId,prefix:tagPrefix,separator:tagSeparator,padding:tagDigits}});await tagQuery.refetch();toast.success("Asset tag settings saved for this business");}catch(e:any){toast.error(e?.message||"Unable to save tag settings")}finally{setTagSaving(false)}};
  useEffect(() => {
    if (detailQuery.data?.tenant?.name) setNameDraft(detailQuery.data.tenant.name);
  }, [detailQuery.data?.tenant?.name]);

  useEffect(() => {
    const t = detailQuery.data?.tenant;
    if (!t) return;
    setTrialDays(t.trial_days_override == null ? "" : String(t.trial_days_override));
    setSeatLimit(t.trial_user_limit_override == null ? "" : String(t.trial_user_limit_override));
    setPriceOverride(t.paid_price_override == null ? "" : String(t.paid_price_override));
  },[detailQuery.data?.tenant]);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((tenant: any) =>
      tenant.name.toLowerCase().includes(q) ||
      tenant.slug.toLowerCase().includes(q) ||
      tenant.status.toLowerCase().includes(q)
    );
  }, [tenants, search]);

  const refreshAll = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      detailQuery.refetch(),
    ]);
  };

  const changeTenantStatus = async (status: "trial" | "active" | "expired" | "suspended") => {
    if (!selectedTenantId) return;
    try {
      await authCall(saveTenant, {
        data: {
          tenant_id: selectedTenantId,
          status,
          plan_code: status === "active" ? (["starter","business","enterprise"].includes(tenant?.plan_code)?tenant.plan_code:"paid") : "trial",
        },
      });
      await qc.invalidateQueries({ queryKey: ["saas-admin-dashboard"] });
      await detailQuery.refetch();
      toast.success(`Business is now ${status}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not update business plan");
    }
  };

  const setNamedPlan=async(plan:string)=>{
    if(!selectedTenantId||!tenant||tenant.effective_status!=="active")return;
    try{await authCall(assignPlan,{data:{tenant_id:selectedTenantId,plan_code:plan}});await refreshAll();toast.success("Assigned "+plan+" package");}
    catch(error:any){toast.error(error.message||"Cannot assign package")}
  };
  const saveName = async () => {
    if (!selectedTenantId || !nameDraft.trim()) return;
    setSavingName(true);
    try {
      await authCall(saveNameFn, { data: { tenant_id: selectedTenantId, name: nameDraft.trim() } });
      await qc.invalidateQueries({ queryKey: ["saas-admin-dashboard"] });
      await detailQuery.refetch();
      toast.success("Business name updated");
    } catch (error: any) {
      toast.error(error?.message || "Could not update business name");
    } finally {
      setSavingName(false);
    }
  };

  const persistControls = async () => {
    if (!selectedTenantId) return;
    const optionalInteger = (raw:string,min:number,max:number) => {
      if (!raw.trim()) return null;
      const n=Number(raw);
      if (!Number.isInteger(n) || n<min || n>max) throw new Error(`Enter a whole number between ${min} and ${max}.`);
      return n;
    };
    setSavingControls(true);
    try {
      const days=optionalInteger(trialDays,1,3650);
      const seats=optionalInteger(seatLimit,1,100000);
      const price=priceOverride.trim()==="" ? null : Number(priceOverride);
      if (price!==null && (!Number.isFinite(price)||price<0||price>100000000000))
        throw new Error("Enter a valid non-negative subscription price.");
      await authCall(saveControls,{data:{tenant_id:selectedTenantId,
        trial_days_override:days,trial_user_limit_override:seats,paid_price_override:price}});
      await Promise.all([detailQuery.refetch(),qc.invalidateQueries({queryKey:["saas-admin-dashboard"]})]);
      toast.success("Business policy updated without changing other businesses.");
    } catch(e:any) {toast.error(e?.message||"Unable to save business policy");}
    finally {setSavingControls(false);}
  };

  const changeModule = async (moduleKey: string, enabled: boolean | null) => {
    if (!selectedTenantId) return;
    try {
      await authCall(saveModule, { data: { tenant_id: selectedTenantId, module_key: moduleKey, enabled } });
      await detailQuery.refetch();
      toast.success(enabled === null ? "Module returned to global default" : "Business module updated");
    } catch (error: any) {
      toast.error(error?.message || "Could not update module");
    }
  };

  const changeUserStatus = async (userId: string, isActive: boolean) => {
    if (!selectedTenantId) return;
    try {
      await authCall(saveUserStatus, { data: { tenant_id: selectedTenantId, user_id: userId, is_active: isActive } });
      await detailQuery.refetch();
      toast.success(isActive ? "User activated" : "User deactivated");
    } catch (error: any) {
      toast.error(error?.message || "Could not update user");
    }
  };

  const detail: any = detailQuery.data;
  const tenant = detail?.tenant;
  const metrics = detail?.metrics;
  const money = (value: number) => Number(value || 0).toLocaleString();

  return (
    <div className="platform-brand space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select one organization to inspect its usage and control its plan, modules and users.
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {dashboardQuery.error && <Card className="border-destructive/40 p-4 text-sm text-destructive" role="alert">Businesses could not be loaded: {(dashboardQuery.error as Error).message} <Button variant="outline" size="sm" className="ml-3" onClick={() => dashboardQuery.refetch()}>Retry</Button></Card>}
      {dashboardQuery.isLoading && <p className="text-sm text-muted-foreground">Loading businesses…</p>}
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <Card className="h-fit overflow-hidden">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search businesses…" className="pl-9" />
            </div>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-2">
            {filteredTenants.map((item: any) => {
              const active = item.id === selectedTenantId;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedTenantId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.slug}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">{item.status}</Badge>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>{item.users} users</span>
                    <span>{item.assets} assets</span>
                  </div>
                </button>
              );
            })}
            {!dashboardQuery.isLoading && !dashboardQuery.error && !filteredTenants.length && <p className="p-4 text-sm text-muted-foreground">{search ? "No businesses match your search." : "No registered businesses were returned."}</p>}
          </div>
        </Card>

        {!selectedTenantId ? (
          <Card className="p-8 text-sm text-muted-foreground">Select a business to manage it.</Card>
        ) : detailQuery.isLoading ? (
          <Card className="p-8 text-sm text-muted-foreground">Loading business controls…</Card>
        ) : detailQuery.error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            {(detailQuery.error as Error).message}
          </Card>
        ) : tenant ? (
          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{tenant.name}</h2>
                    <Badge variant="outline" className="capitalize">{tenant.effective_status}</Badge>
                    <Badge variant="secondary">{tenant.plan_code}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tenant.slug} · Created {new Date(tenant.created_at).toLocaleDateString()}</p>
                </div>
                <div className="w-full sm:w-52 space-y-2"><label className="block text-xs font-medium">Assigned paid package</label><Select value={["starter","business","enterprise"].includes(tenant.plan_code)?tenant.plan_code:"legacy"} disabled={tenant.effective_status!=="active"} onValueChange={v=>setNamedPlan(v==="legacy"?"paid":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="legacy">Legacy paid plan</SelectItem><SelectItem value="starter">Starter</SelectItem><SelectItem value="business">Business</SelectItem><SelectItem value="enterprise">Enterprise</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">SaaS Admin sets the package without changing the subscription expiry.</p></div><div className="w-full sm:w-52">
                  <Select value={tenant.effective_status} onValueChange={(value) => changeTenantStatus(value as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Active / Paid</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Business name" />
                <Button onClick={saveName} disabled={savingName || nameDraft.trim() === tenant.name}>{savingName ? "Saving…" : "Save name"}</Button>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div><h3 className="font-semibold">Export and download locks</h3>
              <p className="text-sm text-muted-foreground">Trial businesses are locked by default. Paid businesses are allowed by default. Override each category for this business, including paid businesses. Inherit restores the default.</p></div>
              {exportQuery.isLoading ? <p className="text-sm">Loading download controls…</p> :
              exportQuery.error ? <p className="text-sm text-destructive">Could not load download controls. Changes are disabled.</p> :
              <div className="space-y-3">
                {exportCapabilities.map(({key,label})=><div key={key} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">{label}</span>
                  <Select value={exportQuery.data?.[key]===true?"allow":exportQuery.data?.[key]===false?"deny":"inherit"}
                    disabled={exportSaving!==null} onValueChange={v=>changeExport(key,v)}>
                    <SelectTrigger className="w-48"><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="inherit">Plan default</SelectItem><SelectItem value="allow">Allow</SelectItem><SelectItem value="deny">Lock</SelectItem></SelectContent>
                  </Select>
                </div>)}
              </div>}
            </Card>
            <Card className="p-5 space-y-4">
              <div>
                <h3 className="font-semibold">Business-specific controls</h3>
                <p className="text-sm text-muted-foreground">Leave a field empty to inherit the global setting. Saving a new trial duration recalculates this business’s expiry from its original trial start, without changing other organizations.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-2 text-sm"><span className="font-medium">Trial duration (days)</span>
                  <Input type="number" min="1" max="3650" step="1" value={trialDays} placeholder="Global default" onChange={e=>setTrialDays(e.target.value)}/></label>
                <label className="space-y-2 text-sm"><span className="font-medium">Trial user limit</span>
                  <Input type="number" min="1" max="100000" step="1" value={seatLimit} placeholder="Global default" onChange={e=>setSeatLimit(e.target.value)}/></label>
                <label className="space-y-2 text-sm"><span className="font-medium">Subscription price (UGX)</span>
                  <Input type="number" min="0" step="0.01" value={priceOverride} placeholder="Global default" onChange={e=>setPriceOverride(e.target.value)}/></label>
              </div>
              <p className="text-xs text-muted-foreground">Current trial expiry: {tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleString() : "Not set"}. Subscription expiry: {tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at).toLocaleString() : "Not set"}.</p>
              <Button disabled={savingControls} onClick={persistControls}>{savingControls ? "Saving..." : "Save business controls"}</Button>
            </Card>

            <Card className="space-y-4 p-5">
              <div><h3 className="text-base font-semibold">Asset tag numbering</h3><p className="text-sm text-muted-foreground">Set the prefix used when this company registers or imports assets without an existing tag. Existing tag numbers are not changed.</p></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-2 text-sm"><span className="font-medium">Company initials</span><Input maxLength={10} value={tagPrefix} onChange={e=>setTagPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/></label>
                <label className="space-y-2 text-sm"><span className="font-medium">Separator</span><Select value={tagSeparator||"none"} onValueChange={value=>setTagSeparator(value==="none"?"":value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="-">Dash</SelectItem><SelectItem value="/">Slash</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></label>
                <label className="space-y-2 text-sm"><span className="font-medium">Number of digits</span><Select value={String(tagDigits)} onValueChange={value=>setTagDigits(Number(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[2,3,4,5,6,7,8,9,10,11,12].map(n=><SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Example: {tagPrefix}{tagSeparator}{String(tagQuery.data?.next_number??1).padStart(tagDigits,"0")}</p><Button disabled={tagSaving||!tagPrefix} onClick={persistTags}>{tagSaving?"Saving…":"Save numbering"}</Button></div>
            </Card>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SmallMetric label="Users" value={metrics?.users ?? 0} icon={Users} />
              <SmallMetric label="Assets" value={metrics?.assets ?? 0} icon={Boxes} />
              <SmallMetric label="Branches" value={metrics?.branches ?? 0} icon={Building2} />
              <SmallMetric label="Asset value" value={money(metrics?.assetValue ?? 0)} icon={WalletCards} />
            </div>

            <Card className="overflow-hidden">
              <div className="border-b p-5">
                <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="font-semibold">Business module control</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">Optional add-ons are activated separately for each business.</p>
              </div>
              <div className="divide-y">
                {(detail.modules ?? []).map((module: any) => (
                  <div key={module.module_key} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{module.label}</p>
                        <Badge variant="outline">{module.billing_model === "add_on" ? "Optional add-on" : "Included in plan"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {module.billing_model === "add_on"
                          ? "Global " + (module.globally_enabled ? "available" : "off") + " · " + (module.effectiveEnabled ? "Active for this business" : "Not active for this business")
                          : "Global " + (module.globally_enabled ? "on" : "off") + " · Effective " + (module.effectiveEnabled ? "enabled" : "disabled")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={module.override === null ? module.effectiveEnabled : !!module.override}
                        disabled={!module.globally_enabled}
                        onCheckedChange={(checked) => changeModule(module.module_key, checked)}
                      />
                      <span className="w-24 text-xs text-muted-foreground">
                        {module.billing_model === "add_on"
                          ? (module.effectiveEnabled ? "Activated" : "Activate add-on")
                          : (module.override === null ? "Plan default" : "Override")}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" disabled={module.override === null} onClick={() => changeModule(module.module_key, null)}>
                      {module.billing_model === "add_on" ? "Deactivate" : "Use default"}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b p-5">
                  <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h3 className="font-semibold">Business users</h3></div>
                </div>
                <div className="max-h-[430px] divide-y overflow-y-auto">
                  {(detail.users ?? []).map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{user.full_name || user.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{user.tenant_role} · {(user.roles || []).join(", ") || "staff"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${user.is_active ? "text-emerald-700" : "text-muted-foreground"}`}>{user.is_active ? "Active" : "Off"}</span>
                        <Switch checked={!!user.is_active} onCheckedChange={(checked) => changeUserStatus(user.id, checked)} />
                      </div>
                    </div>
                  ))}
                  {!detail.users?.length && <p className="p-5 text-sm text-muted-foreground">No users in this business.</p>}
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b p-5">
                  <div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary" /><h3 className="font-semibold">Domains & branches</h3></div>
                </div>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Domains</p>
                    <div className="mt-3 space-y-2">
                      {(detail.domains ?? []).map((domain: any) => (
                        <div key={domain.id} className="rounded-lg border p-3">
                          <p className="truncate text-sm font-medium">{domain.hostname}</p>
                          <p className="mt-1 text-xs capitalize text-muted-foreground">{domain.status}</p>
                        </div>
                      ))}
                      {!detail.domains?.length && <p className="text-sm text-muted-foreground">No custom domains.</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branches</p>
                    <div className="mt-3 space-y-2">
                      {(detail.branches ?? []).map((branch: any) => (
                        <div key={branch.id} className="rounded-lg border p-3">
                          <p className="truncate text-sm font-medium">{branch.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{branch.code || "No code"} · {branch.is_active ? "Active" : "Inactive"}</p>
                        </div>
                      ))}
                      {!detail.branches?.length && <p className="text-sm text-muted-foreground">No branches.</p>}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b p-5">
                  <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /><h3 className="font-semibold">Recent billing</h3></div>
                </div>
                <div className="divide-y">
                  {(detail.billing ?? []).slice(0, 8).map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-semibold">{tx.currency} {Number(tx.amount || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline" className="capitalize">{tx.status}</Badge>
                    </div>
                  ))}
                  {!detail.billing?.length && <p className="p-5 text-sm text-muted-foreground">No billing transactions yet.</p>}
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b p-5">
                  <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /><h3 className="font-semibold">Recent business activity</h3></div>
                </div>
                <div className="divide-y">
                  {(detail.recentActivity ?? []).slice(0, 10).map((row: any) => (
                    <div key={row.id} className="p-4">
                      <p className="text-sm font-medium">{String(row.action || "activity").replaceAll("_", " ")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.entity_type} · {new Date(row.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                  {!detail.recentActivity?.length && <p className="p-5 text-sm text-muted-foreground">No recent activity.</p>}
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
