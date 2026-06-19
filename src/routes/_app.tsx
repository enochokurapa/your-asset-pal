import { createFileRoute, Outlet, Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, ModuleKey } from "@/hooks/use-auth";
import {
  LayoutDashboard, Package, Tags, MapPin, Users, Boxes, LogOut, Menu, X, FileBarChart, Building2, History, UserCircle, TrendingDown, DoorOpen, Settings, ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav: Array<{ to: string; label: string; icon: any; module?: ModuleKey; adminOnly?: boolean }> = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/assets", label: "Assets", icon: Package, module: "assets" },
  { to: "/categories", label: "Categories", icon: Tags, module: "categories" },
  { to: "/locations", label: "Locations", icon: MapPin, module: "locations" },
  { to: "/branches", label: "Branches", icon: Building2, module: "branches", adminOnly: true },
  { to: "/depreciation", label: "Depreciation", icon: TrendingDown, module: "depreciation" },
  { to: "/gate-pass", label: "Gate Pass", icon: DoorOpen, module: "gate_pass" },
  { to: "/verification", label: "Verification", icon: ClipboardCheck, module: "verification" },
  { to: "/reports", label: "Reports", icon: FileBarChart, module: "reports" },
  { to: "/audit", label: "Audit Trail", icon: History, module: "audit" },
  { to: "/users", label: "Users", icon: Users, module: "users", adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, module: "settings" },
  { to: "/profile", label: "My profile", icon: UserCircle },
];


function AppLayout() {
  const { user, loading, signOut, isAdmin, roles, canView, mustChangePassword } = useAuth();
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

  const visibleNav = nav.filter((n) => {
    if (n.adminOnly && !isAdmin) return false;
    if (n.module && !canView(n.module)) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">AssetFlow</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Asset Manager</p>
            </div>
          </div>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="truncate text-xs font-medium text-sidebar-accent-foreground">{user.email}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              {roles.length ? roles.join(" · ") : "no role"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <div className="hidden text-sm text-muted-foreground sm:block">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <NotificationBell />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
