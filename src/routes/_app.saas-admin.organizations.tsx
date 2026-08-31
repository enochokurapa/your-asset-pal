import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { listSaasTenants, updateTenantSubscription } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/organizations")({
  component: SaasAdminOrganizationsPage,
});

function SaasAdminOrganizationsPage() {
  const { isSaasAdmin } = useAuth();
  const listTenants = useServerFn(listSaasTenants);
  const saveTenant = useServerFn(updateTenantSubscription);

  const authCall = async <T,>(fn: (arg: any) => Promise<T>, arg: any = {}) => {
    const headers = await getServerAuthHeaders();
    return fn({ ...arg, headers });
  };

  const {
    data: tenants = [],
    refetch,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["saas-admin-tenants"],
    queryFn: () => authCall(listTenants),
    enabled: isSaasAdmin,
  });

  const changeTenantStatus = async (
    tenant: any,
    status: "trial" | "active" | "expired" | "suspended",
  ) => {
    try {
      await authCall(saveTenant, {
        data: {
          tenant_id: tenant.id,
          status,
          plan_code: status === "active" ? "paid" : "trial",
        },
      });
      await refetch();
      toast.success(`${tenant.name} is now ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update organization");
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Organizations</h2>
            <p className="text-sm text-muted-foreground">
              Manage workspace subscription state. Entering trial recalculates expiry from the current global trial policy.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message || "Organizations could not be loaded."}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading organizations…</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No organizations found.</p>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant: any) => (
            <div
              key={tenant.id}
              className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{tenant.name}</p>
                  <Badge variant="outline" className="capitalize">
                    {tenant.subscription_status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tenant.slug} · Trial ends {tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : "—"}
                </p>
              </div>

              <div className="w-full md:w-48">
                <Select
                  value={tenant.subscription_status}
                  onValueChange={(value) => changeTenantStatus(tenant, value as any)}
                >
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
          ))}
        </div>
      )}
    </Card>
  );
}
