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
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/policy")({
  component: SaasAdminPolicyPage,
});

type SettingsForm = {
  trial_days: number;
  trial_user_limit: number;
  paid_price: number;
  currency: string;
};

function SaasAdminPolicyPage() {
  const { isSaasAdmin } = useAuth();
  const qc = useQueryClient();
  const getPolicy = useServerFn(getGlobalSaasPolicy);
  const savePolicy = useServerFn(updateGlobalSaasPolicy);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SettingsForm | null>(null);

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
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <Settings2 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Global plan policy & pricing</h2>
          <p className="text-sm text-muted-foreground">
            Trial duration, trial user limit, price and currency come from this saved global policy. There is no four-week UI fallback.
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
            <div className="space-y-2">
              <Label>Paid price</Label>
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
  );
}
