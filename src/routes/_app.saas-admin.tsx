import { Link, Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Building2,
  Boxes,
  DatabaseBackup,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_app/saas-admin")({
  component: SaasAdminLayout,
});

const NAV_ITEMS = [
  { to: "/saas-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/saas-admin/policy", label: "Plan & Pricing", icon: Settings2 },
  { to: "/saas-admin/backups", label: "Backup & Restore", icon: DatabaseBackup },
  { to: "/saas-admin/modules", label: "Modules", icon: Boxes },
  { to: "/saas-admin/organizations", label: "Organizations", icon: Building2 },
] as const;

function SaasAdminLayout() {
  const { isSaasAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isSaasAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">SaaS Administration</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform-level controls. Use the navigation to manage one area at a time.
          </p>
        </div>
        <Badge>SaaS Admin</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit p-2 lg:sticky lg:top-4">
          <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="SaaS administration">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={item.exact ? { exact: true } : undefined}
                  className="flex min-w-max items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  activeProps={{
                    className:
                      "flex min-w-max items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm",
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </Card>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
