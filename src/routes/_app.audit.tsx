import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AuditTrailView } from "@/components/audit-trail-view";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
    entity: typeof s.entity === "string" ? s.entity : undefined,
  }),
});

function AuditPage() {
  const { canView } = useAuth();
  const search = Route.useSearch();
  if (!canView("audit")) return <Navigate to="/dashboard" />;
  return <AuditTrailView initialQ={search.q} initialEntity={search.entity} />;
}
