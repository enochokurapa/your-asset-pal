import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/saas-admin")({
  component: SaasAdminGuard,
});

function SaasAdminGuard() {
  const { isSaasAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isSaasAdmin) return <Navigate to="/dashboard" />;

  return <Outlet />;
}
