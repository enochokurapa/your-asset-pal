import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type ExportCapability = "register" | "template" | "reports" | "documents" | "other";
const capabilities: ExportCapability[] = ["register", "template", "reports", "documents", "other"];
export type ExportPermissions = Record<ExportCapability, boolean>;
const locked: ExportPermissions = { register: false, template: false, reports: false, documents: false, other: false };

function normalizePolicy(value: unknown): ExportPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...locked };
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(capabilities.map(key => [key, obj[key] === true])) as ExportPermissions;
}
export async function getExportPermissions(): Promise<ExportPermissions> {
  const { data, error } = await supabase.rpc("my_export_permissions" as any);
  if (error) throw new Error("Export permission verification failed: " + error.message);
  return normalizePolicy(data);
}
export async function requireExportPermission(capability: ExportCapability): Promise<void> {
  const access = await getExportPermissions();
  if (!access[capability]) throw new Error("Downloads are locked for this business. Contact your SaaS administrator.");
}
export function useExportAccess() {
  const {tenantId, user} = useAuth();
  const query = useQuery({
    queryKey: ["business-export-permissions", tenantId, user?.id],
    enabled: Boolean(tenantId && user),
    queryFn: getExportPermissions,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return {
    allowed: (capability: ExportCapability) => query.data?.[capability] === true,
    loading: query.isLoading,
    error: query.error,
    refresh: query.refetch,
  };
}

/** Re-check live tenant permissions immediately before the browser creates a file. */
export async function runPermittedExport(capability: ExportCapability, action: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await requireExportPermission(capability);
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export is not allowed.";
    const { toast } = await import("sonner");
    toast.error(message);
  }
}
