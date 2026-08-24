import { createFileRoute, Outlet, Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, ModuleKey } from "@/hooks/use-auth";
import {
  LayoutDashboard, Package, Tags, MapPin, Users, Boxes, LogOut, Menu, X, FileBarChart,
  Building2, History, UserCircle, TrendingDown, DoorOpen, Settings, ClipboardCheck, Download,
  CreditCard, Globe2, ShieldCheck, LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";
import { triggerInstallPrompt } from "@/components/install-pwa-prompt";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({ component: AppLayout });

type NavItem = {
  to: string;
  label: string;
  icon: any;
  module?: ModuleKey;
  adminOnly?: boolean;
  tenantAdminOnly?: boolean;
};

const tenantNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/assets", label: "Assets", icon: Package, module: "assets" },
  { to: "/categories", label: "Categories", icon: Tags, module: "categories" },
  { to: "/locations", label: "Locations", icon: MapPin, module: "locations" },
  { to: "/branches", label: "Branches", icon: Building2, module: "branches", tenantAdminOnly: true },
  { to: "/depreciation", label: "Depreciation", icon: TrendingDown, module: "depreciation" },
  { to: "/gate-pass", label: "Gate Pass", icon: DoorOpen, module: "gate_pass" },
  { to: "/verification", label: "Verification", icon: ClipboardCheck, module: "verification" },
  { to: "/reports", label: "Reports", icon: FileBarChart, module: "reports" },
  { to: "/audit", label: "Audit Trail", icon: History, module: "audit" },
  { to: "/users", label: "Users", icon: Users, module: "users", tenantAdminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, module: "settings", tenantAdminOnly: true },
  { to: "/billing", label: "Plan & Billing", icon: CreditCard, tenantAdminOnly: true },
  { to: "/domains", label: "Custom Domain", icon: Globe2, tenantAdminOnly: true },
  { to: "/profile", label: "My profile", icon: UserCircle },
];

const saasNav: NavItem[] = [
  { to: "/saas-admin", label: "Platform Overview", icon: ShieldCheck },
  { to: "/profile", label: "My profile", icon: UserCircle },
];

function AppLayout() {
  const {
    user, loading, signOut, isAdmin, isTenantAdmin, isSaasAdmin, roles, canView, isPaidFeature,
    mustChangePassword, canExportReports, subscriptionStatus, trialEndsAt,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (mustChangePassword) return <Navigate to="/welcome" />;

  if (isSaasAdmin && !pathname.startsWith("/saas-admin") && !pathname.startsWith("/profile")) {
    return <Navigate to="/saas-admin" />;
  }

  const visibleNav = isSaasAdmin
    ? saasNav
    : tenantNav.filter((n) => {
        if (n.tenantAdminOnly && !isTenantAdmin) return false;
        if (n.adminOnly && !isAdmin) return false;
        if (n.module && !canView(n.module) && !isPaidFeature(n.module)) return false;
        return true;
      });

  const currentModuleItem = !isSaasAdmin
    ? tenantNav.find((n) => n.module && pathname.startsWith(n.to))
    : undefined;
  const lockedPaidFeature = currentModuleItem?.module && isPaidFeature(currentModuleItem.module)
    ? currentModuleItem
    : null;

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  const blockTrialReportExport = (e: React.MouseEvent<HTMLElement>) => {
    if (isSaasAdmin || !pathname.startsWith("/reports") || canExportReports) return;
    const target = e.target as HTMLElement;
    const button = target.closest("button");
    if (!button) return;
    const text = (button.textContent || "").trim().toLowerCase();
    if (text === "pdf" || text === "excel") {
      e.preventDefault();
      e.stopPropagation();
      toast.error("Report downloads are available on the paid plan. You can still view all reports during the free trial.");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {isSaasAdmin ? <ShieldCheck className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">AssetFlow</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                {isSaasAdmin ? "SaaS Control Plane" : "Asset Manager"}
              </p>
            </div>
          </div>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>

        {isSaasAdmin && (
          <div className="mx-3 mt-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground/75">
            Platform administration is separate from customer workspaces.
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            const paid = item.module ? isPaidFeature(item.module) : false;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {paid && (
                  <span className="flex items-center gap-1 rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                    <LockKeyhole className="h-3 w-3" /> Paid
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="truncate text-xs font-medium text-sidebar-accent-foreground">{user.email}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              {isSaasAdmin ? "SaaS Admin" : isTenantAdmin ? "Admin" : roles.length ? roles.join(" · ") : "member"}
            </p>
          </div>
          <button onClick={triggerInstallPrompt} className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Download className="h-4 w-4 text-primary" /> Install App</button>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
          {isSaasAdmin && <div className="hidden text-sm font-medium text-foreground sm:block">Platform Administration</div>}
          <div className="flex-1" />
          {!isSaasAdmin && subscriptionStatus === "trial" && isTenantAdmin && (
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 border-primary/20 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 sm:inline-flex">
              <Link to="/billing">Trial · {trialDaysLeft ?? "—"} days left</Link>
            </Button>
          )}
          <div className="hidden text-sm text-muted-foreground lg:block">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg border-primary/20 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10" onClick={triggerInstallPrompt}><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Install App</span></Button>
          {!isSaasAdmin && <NotificationBell />}
          <Button variant="ghost" size="icon" title="Sign out" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4 text-muted-foreground hover:text-foreground" /></Button>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8" onClickCapture={blockTrialReportExport}>
          {!isSaasAdmin && pathname.startsWith("/reports") && !canExportReports && subscriptionStatus === "trial" && !lockedPaidFeature && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /><span><strong>Free trial:</strong> reports are view-only. PDF and Excel downloads are locked until upgrade.</span></div>
              {isTenantAdmin && <Button asChild size="sm"><Link to="/billing">Upgrade</Link></Button>}
            </div>
          )}
          {!isSaasAdmin && (subscriptionStatus === "expired" || subscriptionStatus === "suspended") && !pathname.startsWith("/billing") && (
            <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <strong>{subscriptionStatus === "expired" ? "Trial/subscription expired." : "Workspace suspended."}</strong> Application modules are unavailable until the workspace is reactivated.{isTenantAdmin && <> <Link to="/billing" className="font-semibold text-primary underline">Open billing</Link>.</>}
            </div>
          )}

          {lockedPaidFeature ? (
            <div className="mx-auto max-w-2xl py-8">
              <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <LockKeyhole className="h-7 w-7" />
                </div>
                <h1 className="mt-5 text-2xl font-bold">{lockedPaidFeature.label}</h1>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                  This feature is available on the paid plan. It stays visible during your free trial so you can see what becomes available after upgrade.
                </p>
                {isTenantAdmin ? (
                  <Button asChild className="mt-6"><Link to="/billing">Upgrade to unlock</Link></Button>
                ) : (
                  <p className="mt-6 text-sm font-medium text-muted-foreground">Ask your admin to upgrade the workspace.</p>
                )}
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
