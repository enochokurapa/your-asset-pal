import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  Boxes,
  DatabaseBackup,
  Settings2,
  ShieldCheck,
} from "lucide-react";

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
    title: "Module Control",
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

export function SaasAdminOverview() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">SaaS Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-level controls for plans, backups, modules and organizations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                      <h2 className="font-semibold">{section.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
