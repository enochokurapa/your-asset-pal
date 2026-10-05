import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, BarChart3, Boxes, Building2, Check, ClipboardCheck, Cloud, Database,
  DoorOpen, FileBarChart, FileCheck2, Globe2, History, Laptop, LockKeyhole, MapPin,
  MapPinned, Package, PlugZap, Printer, ScanLine, Server, ShieldCheck, Smartphone,
  Tags, TrendingDown, Users, Wifi, Workflow, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";

export const Route = createFileRoute("/")({
  component: PublicHome,
  head: () => ({
    meta: [
      { title: "AssetFlow 360 | Fixed Asset Management, Tracking, GPS, Depreciation and Reports" },
      {
        name: "description",
        content:
          "AssetFlow 360 is fixed asset management software for asset registers, QR and barcode capture, branches, locations, GPS verification, assignments, depreciation, gate passes, audit trails, reports and secure API integrations.",
      },
      {
        name: "keywords",
        content:
          "fixed asset management software, asset tracking system, asset register software, asset inventory management, QR code asset tracking, GPS asset verification, depreciation software, gate pass management, asset audit trail, asset management SaaS, asset reporting, asset API",
      },
      { name: "robots", content: "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" },
      { property: "og:title", content: "AssetFlow 360 | Complete Fixed Asset Management" },
      {
        property: "og:description",
        content:
          "Track, locate, assign, verify, depreciate, move and report on fixed assets from one secure workspace.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://assetflow360.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AssetFlow 360 | Fixed Asset Management" },
      {
        name: "twitter:description",
        content:
          "One system for asset registers, locations, GPS verification, depreciation, gate passes, reporting and integrations.",
      },
    ],
    links: [{ rel: "canonical", href: "https://assetflow360.com/" }],
  }),
});

const coreFeatures = [
  {
    icon: Package,
    title: "Central asset register",
    text: "Keep asset tags, serial numbers, categories, branches, locations, custodians, condition and lifecycle status in one controlled register.",
  },
  {
    icon: MapPinned,
    title: "Location and GPS",
    text: "Model branches, buildings, floors, rooms and field locations, then verify assets with GPS when your workflow requires it.",
  },
  {
    icon: ScanLine,
    title: "QR and field verification",
    text: "Capture and verify assets quickly in the field, record exceptions and maintain a clear verification history.",
  },
  {
    icon: TrendingDown,
    title: "Depreciation",
    text: "Manage useful life, residual values, methods, posting runs, overrides and depreciation schedules from the same asset record.",
  },
  {
    icon: DoorOpen,
    title: "Gate pass control",
    text: "Manage requests, approvals, checkout, destination, return and audit records when assets leave controlled premises.",
  },
  {
    icon: FileBarChart,
    title: "Official reporting",
    text: "Generate branded management reports with organisation identity, report metadata, page numbering and approval sign-off space.",
  },
];

const moduleGroups = [
  {
    title: "Asset operations",
    items: ["Asset register", "Categories", "Branches", "Locations", "Assignments", "Movements"],
  },
  {
    title: "Control and assurance",
    items: ["Verification", "Gate passes", "Approvals", "Audit trail", "Roles and permissions"],
  },
  {
    title: "Finance and reporting",
    items: ["Depreciation", "Asset reports", "Location reports", "Excel and PDF export"],
  },
  {
    title: "Platform and integration",
    items: ["API access", "Tracking integration", "Custom domains", "PWA install", "Workspace branding"],
  },
];

const assets = [
  { icon: Laptop, name: "Laptop", tag: "IT-00482", place: "Finance Office", status: "Verified" },
  { icon: Printer, name: "Printer", tag: "ADM-00117", place: "Main Building", status: "In use" },
  { icon: Server, name: "Server", tag: "ICT-00031", place: "Server Room", status: "Monitored" },
  { icon: Smartphone, name: "Field device", tag: "MOB-00204", place: "Field team", status: "Assigned" },
];

const integrationItems = [
  {
    icon: PlugZap,
    title: "Secure API access",
    text: "Issue scoped API keys for approved integrations without exposing the underlying database.",
  },
  {
    icon: Database,
    title: "Read core asset data",
    text: "Integrate assets, locations and branches into reporting, ERP or operational workflows.",
  },
  {
    icon: Workflow,
    title: "Tracking ingest path",
    text: "A controlled telemetry path is ready for approved GPS or IoT providers when Live Tracking is enabled.",
  },
  {
    icon: Cloud,
    title: "Built for connected systems",
    text: "Use the API foundation to connect finance, HR, IT service, IoT and analytics workflows as your organisation grows.",
  },
];

function PublicHome() {
  const { user } = useAuth();

  return (
    <div className="platform-brand min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center" aria-label="AssetFlow 360 home">
            <PlatformLogo variant="lockup" className="h-9 w-[168px] max-w-[46vw]" />
          </Link>

          <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#locations" className="transition hover:text-foreground">Locations</a>
            <a href="#modules" className="transition hover:text-foreground">Modules</a>
            <a href="#integrations" className="transition hover:text-foreground">API & Integrations</a>
            <a href="#security" className="transition hover:text-foreground">Security</a>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-7">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">Dashboard <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Start free trial <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 -z-20 bg-background" />
          <div className="absolute inset-0 -z-10 opacity-35 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px)] [background-size:46px_46px]" />
          <div className="absolute -right-32 top-12 -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

          <div className="mx-auto grid max-w-7xl gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-8 lg:py-28">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Fixed asset control from registration to disposal
              </div>

              <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl lg:text-[4rem] lg:leading-[1.02]">
                Every asset.
                <br />
                <span className="text-primary">One trusted system.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                AssetFlow 360 helps organisations register, locate, assign, verify, depreciate,
                move and report on fixed assets from one secure workspace built for daily operations
                and management decisions.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 px-6">
                  <Link to={user ? "/dashboard" : "/register"}>
                    {user ? "Open dashboard" : "Start free trial"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 px-6">
                  <a href="#features">Explore features</a>
                </Button>
              </div>

              <div className="mt-6 grid max-w-xl grid-cols-2 gap-x-5 gap-y-2 text-sm text-muted-foreground sm:grid-cols-3">
                {["Multi-branch ready", "QR and GPS workflows", "Branded reports"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-primary" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[1.6rem] border bg-card p-4 shadow-2xl shadow-primary/10">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Live asset view</p>
                    <h2 className="mt-1 text-lg font-bold">Know what you own and where it is</h2>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Boxes className="h-5 w-5" />
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {assets.map(({ icon: Icon, name, tag, place, status }) => (
                    <div key={tag} className="rounded-xl border bg-background p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          <p className="text-xs text-muted-foreground">{tag}</p>
                        </div>
                        <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {status}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate">{place}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-background p-3">
                    <p className="text-[11px] text-muted-foreground">Assets</p>
                    <p className="mt-1 text-xl font-bold">1,284</p>
                  </div>
                  <div className="rounded-xl border bg-background p-3">
                    <p className="text-[11px] text-muted-foreground">Located</p>
                    <p className="mt-1 text-xl font-bold">1,241</p>
                  </div>
                  <div className="rounded-xl border bg-background p-3">
                    <p className="text-[11px] text-muted-foreground">Verified</p>
                    <p className="mt-1 text-xl font-bold">96%</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold">Asset control flow</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Register, locate, verify, move, report</p>
                    </div>
                    <div className="flex items-center gap-2 text-primary">
                      <ScanLine className="h-4 w-4" />
                      <ArrowRight className="h-3.5 w-3.5" />
                      <MapPinned className="h-4 w-4" />
                      <ArrowRight className="h-3.5 w-3.5" />
                      <FileCheck2 className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-5 -left-4 hidden rounded-xl border bg-background px-4 py-3 shadow-xl sm:block">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Wifi className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold">Field ready</p>
                    <p className="text-[10px] text-muted-foreground">Mobile capture and PWA access</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b bg-muted/25">
          <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            <div className="grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Register", "Build a clean asset register"],
                ["Locate", "Know branch, room or field location"],
                ["Control", "Approvals, gate passes and audit"],
                ["Report", "Management-ready evidence"],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border bg-background px-4 py-4">
                  <p className="text-sm font-bold">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Complete asset lifecycle</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              One operational system instead of disconnected spreadsheets.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              AssetFlow connects the information that normally gets scattered between stores,
              finance, administration, security, field teams and management.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="locations" className="border-y bg-muted/25">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Location intelligence</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Model the way your organisation actually stores and deploys assets.
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Use internal locations, branches, geographic locations or a hybrid model.
                Configure the rules once, then field users only see the location fields they need.
              </p>

              <div className="mt-7 space-y-3">
                {[
                  "Organisation hierarchy: site, building, floor, room, office, store or warehouse",
                  "Geographic hierarchy: country, district or county, subdivision and locality",
                  "Optional GPS verification for field and mobile workflows",
                  "Location history connected to asset registration and movement",
                ].map((item) => (
                  <div key={item} className="flex gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-xl">
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Example hierarchy</p>
                <div className="mt-4 space-y-2">
                  {[
                    [Building2, "Kampala HQ", "Site"],
                    [Boxes, "Main Building", "Building"],
                    [MapPin, "Floor 2", "Floor"],
                    [Package, "Finance Store", "Store"],
                  ].map(([Icon, label, type], index) => {
                    const C = Icon as typeof Package;
                    return (
                      <div key={String(label)} className="flex items-center gap-3 rounded-xl border px-3 py-3" style={{ marginLeft: index * 12 }}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <C className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{String(label)}</p>
                          <p className="text-[11px] text-muted-foreground">{String(type)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-xl bg-primary/5 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-primary">
                    <MapPinned className="h-4 w-4" />
                    Geographic verification
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Uganda / Kampala District / selected subdivision / optional GPS capture
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modules" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Modules</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your asset team needs, grouped around real work.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {moduleGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border bg-card p-6">
                <h3 className="font-bold">{group.title}</h3>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="integrations" className="border-y bg-muted/25">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">API & integrations</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Asset data should work with the rest of your organisation.
                </h2>
                <p className="mt-4 leading-7 text-muted-foreground">
                  AssetFlow provides a controlled API foundation for approved integrations.
                  Connect asset information to ERP, finance, analytics, HR, IT service or tracking workflows without exposing raw tenant data.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-semibold">
                  <Globe2 className="h-4 w-4 text-primary" />
                  Versioned API foundation
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {integrationItems.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-2xl border bg-background p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-bold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Security and accountability</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Controls that go beyond hiding menu items.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              AssetFlow uses tenant-aware data controls, role and action permissions, branch scope,
              approvals and audit history to support accountable asset operations.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                ["Tenant isolation", "Workspace-owned records stay scoped to the correct organisation."],
                ["Role controls", "Admin, manager, staff and security workflows can be separated."],
                ["Audit history", "Important actions remain traceable for review."],
                ["Approval workflows", "Sensitive changes can follow controlled approval paths."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border p-4">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {title}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-sidebar p-7 text-sidebar-foreground shadow-xl sm:p-9">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">Operational control</p>
            <h3 className="mt-2 text-2xl font-bold">Evidence for every important asset decision.</h3>
            <div className="mt-6 space-y-3">
              {[
                [ClipboardCheck, "Physical verification and mismatch records"],
                [History, "Audit trail and accountability"],
                [DoorOpen, "Gate pass movement control"],
                [FileCheck2, "Branded reports ready for review and filing"],
              ].map(([Icon, text]) => {
                const C = Icon as typeof Package;
                return (
                  <div key={String(text)} className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
                    <C className="h-4 w-4 text-sidebar-primary" />
                    <span className="text-sm">{String(text)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-xl sm:px-10">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Build a cleaner asset register and keep it under control.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
                Start an AssetFlow 360 workspace and bring registration, locations, verification,
                depreciation, gate passes, audit and reporting together.
              </p>
              <Button asChild size="lg" variant="secondary" className="mt-7 h-12 px-7">
                <Link to={user ? "/dashboard" : "/register"}>
                  {user ? "Open dashboard" : "Start free trial"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8">
          <div>
            <PlatformLogo variant="lockup" className="h-8 w-[150px]" />
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Fixed asset management for accountable organisations, from registration and location control to verification, depreciation and reporting.
            </p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#modules" className="hover:text-foreground">Modules</a>
            <a href="#integrations" className="hover:text-foreground">Integrations</a>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
