import { createFileRoute } from "@tanstack/react-router";
import { SaasBackupManager } from "@/components/saas-backup-manager";

export const Route = createFileRoute("/_app/saas-admin/backups")({
  component: SaasAdminBackupsPage,
});

function SaasAdminBackupsPage() {
  return <SaasBackupManager />;
}
