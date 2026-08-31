import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/saas-admin/")({
  component: SaasAdminIndex,
});

function SaasAdminIndex() {
  return <Navigate to="/dashboard" />;
}
