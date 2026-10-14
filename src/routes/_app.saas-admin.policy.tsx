import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  getGlobalSaasPolicy,
  updateGlobalSaasPolicy,
} from "@/lib/saas-policy.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Settings2 } from "lucide-react";
import {getAdminPricingPlans,saveAdminPricingPlan,getAdminAvailableModules} from "@/lib/saas.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/policy")({
  component: SaasAdminPolicyPage,
});

type SettingsForm = {
  trial_days: number;
  trial_user_limit: number;
  paid_price: number;
  currency: string;
  included_paid_users:number;
  extra_user_price:number;
  included_assets:number;
  extra_asset_block_size:number;
  extra_asset_block_price:number;
};

function SaasAdminPolicyPage() {
  const { isSaasAdmin } = useAuth();
  const qc = useQueryClient();
  const getPolicy = useServerFn(getGlobalSaasPolicy);
  const savePolicy = useServerFn(updateGlobalSaasPolicy);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const listPlans=useServerFn(getAdminPricingPlans),updatePlan=useServerFn(saveAdminPricingPlan),listModules=useServerFn(getAdminAvailableModules);
  const [plans,setPlans]=useState<any[]>([]),[savingPlan,setSavingPlan]=useState<string|null>(null),[availableModules,setAvailableModules]=useState<any[]>([]);
  useEffect(()=>{if(!isSaasAdmin)return;getServerAuthHeaders().then(headers=>Promise.all([listPlans({headers}),listModules({headers})])).then(([rows,modules])=>{setPlans(rows as any[]);setAvailableModules(modules as any[])}).catch(e=>toast.error(e.message||"Cannot load plans"))},[isSaasAdmin]);
  const changePlan=(id:string,patch:any)=>setPlans(old=>old.map(p=>p.id===id?{...p,...patch}:p));
  const persistPlan=async(p:any)=>{setSavingPlan(p.id);try{await updatePlan({headers:await getServerAuthHeaders(),data:{id:p.id,name:p.name,description:p.description,monthly_price:Number(p.monthly_price),annual_price:Number(p.annual_price),included_users:Number(p.included_users),included_assets:Number(p.included_assets),features:p.features,enabled_modules:p.enabled_modules??[],is_published:p.is_published}});toast.success("Plan saved");qc.invalidateQueries({queryKey:["pricing-plans"]})}catch(e:any){toast.error(e.message||"Save failed")}finally{setSavingPlan(null)}};


  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data: policy, error } = useQuery({
    queryKey: ["saas-admin-global-policy"],
    queryFn: () => authCall(getPolicy),
    enabled: isSaasAdmin,
  });

  useEffect(() => {
    if (!policy) return;
    setForm({
      trial_days: policy.trialDays,
      trial_user_limit: policy.trialUserLimit,
      paid_price: policy.paidPrice,
      currency: policy.currency,
      included_paid_users:policy.includedPaidUsers,extra_user_price:policy.extraUserPrice,included_assets:policy.includedAssets,extra_asset_block_size:policy.extraAssetBlockSize,extra_asset_block_price:policy.extraAssetBlockPrice,
    });
  }, [policy]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const result = await authCall(savePolicy, { data: form });
      const affected = result.affectedTrialWorkspaces;
      toast.success(
        affected > 0
          ? `SaaS policy saved globally. ${affected} active trial workspace${affected === 1 ? "" : "s"} synchronized.`
          : "SaaS policy saved globally",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["saas-admin-global-policy"] }),
        qc.invalidateQueries({ queryKey: ["saas-context"] }),
        qc.invalidateQueries({ queryKey: ["saas-admin-tenants"] }),
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save SaaS settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5"><Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <Settings2 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Free trial and expansion pricing</h2>
          <p className="text-sm text-muted-foreground">
            The free trial is separate from paid plans. Starter, Business and Enterprise prices are managed below. The existing legacy subscription price is preserved in the background.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message || "The global SaaS policy could not be loaded."}
        </div>
      )}

      {!form ? (
        <p className="text-sm text-muted-foreground">Loading the saved global policy…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">

            <div className="space-y-2"><Label>Price per extra user ({form.currency})</Label><Input type="number" min={0} value={form.extra_user_price} onChange={e=>setForm({...form,extra_user_price:Number(e.target.value)})}/></div><div className="space-y-2"><Label>Assets in one additional block</Label><Input type="number" min={1} value={form.extra_asset_block_size} onChange={e=>setForm({...form,extra_asset_block_size:Number(e.target.value)})}/></div><div className="space-y-2"><Label>Price per asset block ({form.currency})</Label><Input type="number" min={0} value={form.extra_asset_block_price} onChange={e=>setForm({...form,extra_asset_block_price:Number(e.target.value)})}/></div>

          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Trial days</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.trial_days}
                onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Trial user limit</Label>
              <Input
                type="number"
                min={1}
                value={form.trial_user_limit}
                onChange={(e) => setForm({ ...form, trial_user_limit: Number(e.target.value) })}
              />
            </div>
            <div className="hidden">
              <Label>Legacy paid price (existing subscriptions only)</Label>
              <Input
                type="number"
                min={0}
                value={form.paid_price}
                onChange={(e) => setForm({ ...form, paid_price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={8}
              />
            </div>
          </div>

          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Applying globally…" : "Save & apply globally"}
          </Button>
        </>
      )}
    </Card>
    <Card className="space-y-4 p-6"><div><h2 className="text-lg font-semibold">Public pricing packages</h2><p className="text-sm text-muted-foreground">Edit package prices, included users, assets and features shown on the public Pricing page.</p></div><div className="grid gap-4 lg:grid-cols-3">{plans.map(p=><div key={p.id} className="space-y-3 rounded-xl border p-4"><Label>Package name</Label><Input value={p.name} onChange={e=>changePlan(p.id,{name:e.target.value})}/><Label>Description</Label><Input value={p.description} onChange={e=>changePlan(p.id,{description:e.target.value})}/><div className="grid grid-cols-2 gap-3">{[["monthly_price","Monthly price"],["annual_price","Annual price"],["included_users","Included users"],["included_assets","Included assets"]].map(([key,label])=><div key={key} className="space-y-1"><Label>{label}</Label><Input type="number" min={0} value={p[key]} onChange={e=>changePlan(p.id,{[key]:Number(e.target.value)})}/></div>)}</div><Label>Included features (one per line)</Label><textarea className="min-h-32 w-full rounded-md border bg-background p-3 text-sm" value={(p.features??[]).join("\n")} onChange={e=>changePlan(p.id,{features:e.target.value.split("\n").map((x:string)=>x.trim()).filter(Boolean)})}/><div className="space-y-2 border-t pt-3"><Label>Modules included with {p.name}</Label><p className="text-xs text-muted-foreground">Turn modules on or off for this package. API Integration and Live Tracking remain separate paid add-ons.</p><div className="grid grid-cols-2 gap-2">{availableModules.map(m=><label key={m.module_key} className="flex items-center gap-2 rounded-md border p-2 text-xs"><input type="checkbox" checked={(p.enabled_modules??[]).includes(m.module_key)} onChange={e=>changePlan(p.id,{enabled_modules:e.target.checked?[...(p.enabled_modules??[]),m.module_key]:(p.enabled_modules??[]).filter((x:string)=>x!==m.module_key)})}/>{m.label??m.module_key}</label>)}</div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.is_published} onChange={e=>changePlan(p.id,{is_published:e.target.checked})}/>Visible on public pricing</label><Button className="w-full" disabled={savingPlan===p.id} onClick={()=>persistPlan(p)}><Save className="mr-2 h-4 w-4"/>{savingPlan===p.id?"Saving…":"Save package"}</Button></div>)}</div></Card>
    </div>
  );
}
