import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { listSaasModules, updateSaasModule } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Boxes, Save } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/saas-admin/modules")({
  component: SaasAdminModulesPage,
});

function SaasAdminModulesPage() {
  const { isSaasAdmin } = useAuth();
  const qc = useQueryClient();
  const listModules = useServerFn(listSaasModules);
  const saveModule = useServerFn(updateSaasModule);
  const [prices, setPrices] = useState<Record<string, string>>({});

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data: moduleResponse, refetch, isLoading, error } = useQuery({
    queryKey: ["saas-admin-modules"],
    queryFn: () => authCall(listModules),
    enabled: isSaasAdmin,
  });

  const modules = Array.isArray(moduleResponse) ? moduleResponse : [];
  const responseError = !isLoading && moduleResponse != null && !Array.isArray(moduleResponse);

  useEffect(() => {
    setPrices(Object.fromEntries(modules.filter((m: any) => m.billing_model === "add_on").map((m: any) => [m.module_key, String(m.add_on_price ?? "")])));
  }, [modules]);

  const toggleModule = async (
    module: any,
    field: "globally_enabled" | "trial_enabled" | "paid_enabled",
    value: boolean,
  ) => {
    try {
      await authCall(saveModule, {
        data: {
          module_key: module.module_key,
          globally_enabled: field === "globally_enabled" ? value : !!module.globally_enabled,
          trial_enabled: field === "trial_enabled" ? value : !!module.trial_enabled,
          paid_enabled: field === "paid_enabled" ? value : !!module.paid_enabled,
          add_on_price: Number(prices[module.module_key] ?? module.add_on_price ?? 0),
        },
      });
      await refetch();
      await qc.invalidateQueries({ queryKey: ["saas-context"] });
      toast.success(`${module.label} updated globally`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update module");
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start gap-3">
        <Boxes className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Module control</h2>
          <p className="text-sm text-muted-foreground">Set add-on prices.</p>
        </div>
      </div>

      {(error || responseError) && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error ? (error as Error).message : "Unexpected modules response. Please refresh or check the server."}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading modules…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Module</th>
                <th className="px-3 py-2 text-center">Platform</th>
                <th className="px-3 py-2 text-center">Billing</th>
                <th className="px-3 py-2 text-center">Availability</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module: any) => (
                <tr key={module.module_key} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-medium">{module.label}</p>
                    <p className="text-xs text-muted-foreground">{module.module_key}</p>
                  </td>
                  <td className="px-3 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={!!module.globally_enabled}
                        onCheckedChange={(value) => toggleModule(module, "globally_enabled", value)}
                      />
                    </div>
                  </td>
                  <td className="px-3 text-center">
                    <span className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold">
                      {module.billing_model === "add_on" ? "Optional add-on" : "Included in plan"}
                    </span>
                  </td>
                  <td className="px-3 text-center">
                    {module.billing_model === "add_on" ? (
                      <div className="flex items-center justify-center gap-2">
                        <Input
                          className="h-8 w-28 text-right"
                          type="number"
                          min="0"
                          value={prices[module.module_key] ?? String(module.add_on_price ?? "")}
                          onChange={(e) => setPrices((p) => ({ ...p, [module.module_key]: e.target.value }))}
                          aria-label={module.label + " price"}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleModule(module, "globally_enabled", !!module.globally_enabled)}
                          title="Save price"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Trial
                          <Switch checked={!!module.trial_enabled} disabled={!module.globally_enabled} onCheckedChange={(value) => toggleModule(module, "trial_enabled", value)} />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Paid
                          <Switch checked={!!module.paid_enabled} disabled={!module.globally_enabled} onCheckedChange={(value) => toggleModule(module, "paid_enabled", value)} />
                        </label>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
