import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { listSaasModules, updateSaasModule } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Boxes } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/modules")({
  component: SaasAdminModulesPage,
});

function SaasAdminModulesPage() {
  const { isSaasAdmin } = useAuth();
  const qc = useQueryClient();
  const listModules = useServerFn(listSaasModules);
  const saveModule = useServerFn(updateSaasModule);

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const { data: modules = [], refetch, isLoading, error } = useQuery({
    queryKey: ["saas-admin-modules"],
    queryFn: () => authCall(listModules),
    enabled: isSaasAdmin,
  });

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
          <p className="text-sm text-muted-foreground">
            Global OFF wins over workspace and user permissions. Trial-disabled modules remain visible as paid features.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message || "Modules could not be loaded."}
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
                <th className="px-3 py-2 text-center">Free trial</th>
                <th className="px-3 py-2 text-center">Paid</th>
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
                    <div className="flex justify-center">
                      <Switch
                        checked={!!module.trial_enabled}
                        disabled={!module.globally_enabled}
                        onCheckedChange={(value) => toggleModule(module, "trial_enabled", value)}
                      />
                    </div>
                  </td>
                  <td className="px-3 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={!!module.paid_enabled}
                        disabled={!module.globally_enabled}
                        onCheckedChange={(value) => toggleModule(module, "paid_enabled", value)}
                      />
                    </div>
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
