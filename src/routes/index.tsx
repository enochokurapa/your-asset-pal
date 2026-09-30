import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, BarChart3, Boxes, Building2, Check, ClipboardCheck, CreditCard,
  DoorOpen, FileBarChart, Globe2, History, LayoutDashboard, LockKeyhole, MapPin,
  Package, ScanLine, Settings, ShieldCheck, Tags, TrendingDown, Users, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: PublicHome,
  head: () => ({
    meta: [
      { title: "AssetFlow 360 — Fixed Asset Management SaaS" },
      { name: "description", content: "Track, assign, verify, depreciate and report on fixed assets in one secure workspace. Start a free AssetFlow 360 trial." },
    ],
  }),
});

const featureCards = [
  { icon: Package, title: "Complete asset register", text: "Track asset tags, categories, locations, custodians, condition and lifecycle status." },
  { icon: ScanLine, title: "Verification & control", text: "Verify assets in the field, record mismatches and keep a clean accountability trail." },
  { icon: TrendingDown, title: "Depreciation", text: "Manage useful life, methods, runs, overrides and depreciation reporting from the same system." },
  { icon: DoorOpen, title: "Gate passes", text: "Control assets leaving your premises with requests, approvals, checkout and return records." },
  { icon: FileBarChart, title: "Reports", text: "Turn your live asset register into management-ready operational and financial reports." },
  { icon: ShieldCheck, title: "Roles & approvals", text: "Separate administrators, managers, staff and security duties with module and action permissions." },
];

const modules = [
  { icon: LayoutDashboard, label: "Dashboard", text: "KPIs, activity and decisions" },
  { icon: Package, label: "Assets", text: "Full asset register" },
  { icon: Tags, label: "Categories", text: "Asset classification" },
  { icon: MapPin, label: "Locations", text: "Where assets are kept" },
  { icon: Building2, label: "Branches", text: "Multi-site operations" },
  { icon: TrendingDown, label: "Depreciation", text: "Book-value controls" },
  { icon: DoorOpen, label: "Gate Pass", text: "Movement outside premises" },
  { icon: ClipboardCheck, label: "Verification", text: "Physical checks and exceptions" },
  { icon: BarChart3, label: "Reports", text: "Operational reporting" },
  { icon: History, label: "Audit Trail", text: "Who changed what and when" },
  { icon: Users, label: "Users", text: "Roles and responsibilities" },
  { icon: Settings, label: "Settings", text: "Workspace and branding" },
  { icon: CreditCard, label: "Plan & Billing", text: "Subscription controls" },
  { icon: Globe2, label: "Custom Domain", text: "Branded access on paid plans" },
  { icon: Users, label: "My Profile", text: "Personal account settings" },
];

function PublicHome() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Boxes className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">AssetFlow <span className="text-primary">360</span></span>
          </Link>
          <nav className="ml-auto hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#modules" className="transition hover:text-foreground">Modules</a>
            <a href="#security" className="transition hover:text-foreground">Security</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-7">
            {user ? (
              <Button asChild><Link to="/dashboard">Open dashboard <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/login">Sign in</Link></Button>
                <Button asChild><Link to="/register">Start free trial <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 -z-10 opacity-60 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute left-1/2 top-0 -z-10 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-8 lg:py-32">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure multi-tenant asset management
              </div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Know every asset. <span className="text-primary">Control every movement.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                AssetFlow 360 brings your asset register, assignments, branch tracking, verification, depreciation, gate passes, approvals and reporting into one focused SaaS workspace.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 px-6">
                  <Link to={user ? "/dashboard" : "/register"}>{user ? "Open dashboard" : "Start free trial"} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                {!user && <Button asChild variant="outline" size="lg" className="h-12 px-6"><Link to="/login">Sign in</Link></Button>}
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {["No card required", "Your own workspace", "Cancel anytime"].map((x) => (
                  <span key={x} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{x}</span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[1.5rem] border bg-card p-3 shadow-2xl shadow-primary/10">
                <div className="rounded-xl border bg-background">
                  <div className="flex items-center gap-2 border-b px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="ml-3 text-xs font-semibold text-muted-foreground">AssetFlow 360 · Dashboard</span>
                  </div>
                  <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[170px_1fr]">
                    <div className="min-h-[380px] border-r bg-sidebar p-3 text-sidebar-foreground">
                      <div className="mb-5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary"><Boxes className="h-4 w-4" /></span>
                        <span className="hidden text-xs font-bold sm:block">AssetFlow 360</span>
                      </div>
                      <div className="space-y-2">
                        {[LayoutDashboard, Package, MapPin, TrendingDown, FileBarChart].map((Icon, i) => (
                          <div key={i} className={`flex h-9 items-center gap-2 rounded-lg px-2 ${i === 0 ? "bg-sidebar-primary" : "bg-sidebar-accent/40"}`}>
                            <Icon className="h-4 w-4" /><span className="hidden text-[11px] sm:block">{["Dashboard","Assets","Locations","Depreciation","Reports"][i]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      <div className="mb-5">
                        <p className="text-xs text-muted-foreground">Overview</p>
                        <p className="text-lg font-bold">Asset control center</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[["Total assets","1,284"],["In use","1,042"],["Verification","96%"],["Book value","UGX 2.4B"]].map(([k,v]) => (
                          <div key={k} className="rounded-xl border bg-card p-3">
                            <p className="text-[10px] text-muted-foreground sm:text-xs">{k}</p><p className="mt-1 text-base font-bold sm:text-xl">{v}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-xl border p-4">
                        <div className="flex items-center justify-between"><p className="text-xs font-semibold">Asset activity</p><span className="text-[10px] text-muted-foreground">Last 30 days</span></div>
                        <div className="mt-5 flex h-24 items-end gap-2">
                          {[48,72,52,86,64,94,76,100,82,92].map((h,i) => <span key={i} className="flex-1 rounded-t bg-primary/70" style={{height: `${h}%`}} />)}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-xl border px-4 py-3">
                        <div><p className="text-xs font-semibold">Recent verification</p><p className="text-[10px] text-muted-foreground">32 assets checked today</p></div>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">On track</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-5 hidden rounded-xl border bg-card p-3 shadow-xl sm:block">
                <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Zap className="h-4 w-4" /></span><div><p className="text-xs font-semibold">One live register</p><p className="text-[10px] text-muted-foreground">Across teams and branches</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Built for control</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">From acquisition to disposal, keep the whole lifecycle connected.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featureCards.map(({icon: Icon,title,text}) => (
              <article key={title} className="rounded-2xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="modules" className="border-y bg-secondary/35">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Everything in one place</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">All the menus your asset team needs.</h2>
              <p className="mt-4 text-muted-foreground">The workspace is organized around clear operational modules instead of scattered spreadsheets and disconnected approvals.</p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {modules.map(({icon:Icon,label,text}) => (
                <div key={label} className="flex gap-3 rounded-xl border bg-background p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  <div><p className="text-sm font-bold">{label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Workspace isolation</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your organization sees its data—not another customer's.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">AssetFlow 360 enforces tenant boundaries in the database and uses tenant-scoped file paths for private uploads. User roles and module permissions then control access inside your own workspace.</p>
            <div className="mt-7 space-y-3">
              {[
                "Database row-level tenant boundary on customer-owned records",
                "Tenant-aware file access for asset and gate-pass attachments",
                "Role, module, branch, action and approval permissions",
                "Audit history for accountability and review",
              ].map((x) => <div key={x} className="flex gap-3 text-sm"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-3 w-3" /></span><span>{x}</span></div>)}
            </div>
          </div>
          <div className="rounded-3xl bg-sidebar p-7 text-sidebar-foreground shadow-xl sm:p-9">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sidebar-primary"><LockKeyhole className="h-6 w-6" /></div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">Tenant boundary</p>
            <h3 className="mt-2 text-2xl font-bold">Security lives below the interface.</h3>
            <p className="mt-3 text-sm leading-6 text-sidebar-foreground/70">A hidden menu is not a security control. Tenant checks are enforced at the data layer so a customer request cannot simply query another workspace's rows.</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-4"><p className="text-2xl font-bold">RLS</p><p className="mt-1 text-xs text-sidebar-foreground/60">Row-level security</p></div>
              <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-4"><p className="text-2xl font-bold">RBAC</p><p className="mt-1 text-xs text-sidebar-foreground/60">Role-based access</p></div>
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-xl sm:px-10">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start with your own AssetFlow 360 workspace.</h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-primary-foreground/80 sm:text-base">Register your organization, explore the asset-management workflow and move to a paid plan when you are ready.</p>
              <Button asChild size="lg" variant="secondary" className="mt-7 h-12 px-7"><Link to={user ? "/dashboard" : "/register"}>{user ? "Open dashboard" : "Start free trial"} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-semibold text-foreground"><Boxes className="h-4 w-4 text-primary" /> AssetFlow 360</div>
          <p>Fixed asset management for accountable organizations.</p>
        </div>
      </footer>
    </div>
  );
}
