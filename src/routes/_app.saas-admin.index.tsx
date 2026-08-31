import { Link, createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  Boxes,
  DatabaseBackup,
  Settings2,
} from "lucide-react";

export const Route = createFileRoute("/_app/saas-admin/")({
  component: SaasAdminOverview,
});

const SECTIONS = [
  {
    to: "/saas-admin/policy",
    title: "Plan & Pricing",
    description: "Set global trial days, user limits, paid price and currency.",
    icon: Settings2,
  },
  {
    to: "/saas-admin/backups",
    title: "Backup & Restore",
    description: "Manage Cloudflare R2 backups, restore points and automation.",
    icon: DatabaseBackup,
  },
  {
    to: "/saas-admin/modules",
    title: "Modules",
    description: "Control which features are available globally, on trial and on paid plans.",
    icon: Boxes,
  },
  {
    to: "/saas-admin/organizations",
    title: "Organizations",
    description: "Review workspaces and manage their subscription state.",
    icon: Building2,
  },
] as const;

function SaasAdminOverview() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an administration area. Each section now has its own page instead of loading every control together.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.to} to={section.to} className="group block">
              <Card className="h-full p-5 transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{section.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
