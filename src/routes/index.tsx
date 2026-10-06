import { useEffect } from "react";
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

function HeroAssetScene() {
  const floatingAssets = [
    { icon: Laptop, label: "Laptop", className: "left-[3%] top-[20%]", delay: "0s" },
    { icon: Printer, label: "Printer", className: "right-[3%] top-[18%]", delay: ".8s" },
    { icon: Server, label: "Server", className: "right-[6%] bottom-[16%]", delay: "1.4s" },
    { icon: Smartphone, label: "Field device", className: "left-[2%] bottom-[17%]", delay: "2s" },
  ];

  return (
    <div className="relative mx-auto aspect-[1.08/1] w-full max-w-[520px] overflow-hidden rounded-[2rem] border bg-card shadow-2xl shadow-primary/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--primary)_7%,transparent),transparent_62%)]" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 560" aria-hidden="true">
        <path className="af-flow-line" d="M70 150 C166 86, 215 116, 280 225" />
        <path className="af-flow-line af-delay-1" d="M536 145 C446 86, 389 118, 321 225" />
        <path className="af-flow-line af-delay-2" d="M527 430 C442 468, 386 400, 326 322" />
        <path className="af-flow-line af-delay-3" d="M71 437 C159 476, 220 401, 277 326" />

        <path className="af-wave-line" d="M-30 476 C89 410, 184 520, 305 457 C412 401, 496 484, 636 416" />
        <path className="af-wave-line af-delay-2" d="M-42 516 C92 452, 200 548, 320 493 C438 440, 512 512, 646 459" />

        <circle cx="299" cy="274" r="122" fill="none" stroke="currentColor" strokeOpacity=".08" />
        <circle cx="299" cy="274" r="88" fill="none" stroke="currentColor" strokeOpacity=".08" />
      </svg>

      <div className="absolute left-1/2 top-[49%] -translate-x-1/2 -translate-y-1/2">
        <div className="af-person-float relative">
          <svg width="218" height="270" viewBox="0 0 218 270" role="img" aria-label="Asset officer using a tablet">
            <ellipse cx="109" cy="255" rx="72" ry="10" fill="currentColor" opacity=".08" />
            <circle cx="110" cy="55" r="34" fill="#d8a47f" />
            <path d="M80 49c7-36 60-43 72-3-15-9-29-13-44-11-9 1-18 5-28 14Z" fill="#282526" />
            <path d="M69 119c8-31 30-47 59-47 31 0 54 18 63 50l-13 81H81Z" fill="var(--platform-secondary, #4B47DC)" />
            <path d="M67 126c-23 24-33 55-38 83l22 5c8-31 18-53 35-69Z" fill="#d8a47f" />
            <path d="M187 124c21 25 29 57 31 84l-22 2c-4-30-11-53-27-69Z" fill="#d8a47f" />
            <rect x="82" y="133" width="95" height="70" rx="10" fill="#171717" />
            <rect x="90" y="141" width="79" height="54" rx="6" fill="#faf9f7" />
            <circle cx="130" cy="168" r="10" fill="var(--platform-primary, #C77435)" />
            <path d="M125 168h10M130 163v10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d="M89 201h84l12 60H77Z" fill="#2c2a2b" />
            <path d="M102 201v60M158 201v60" stroke="#222" strokeWidth="10" strokeLinecap="round" />
          </svg>

          <div className="af-scan-pulse absolute -right-10 top-24 flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-semibold shadow-lg">
            <ScanLine className="h-3.5 w-3.5 text-primary" />
            Scan
          </div>
        </div>
      </div>

      {floatingAssets.map(({ icon: Icon, label, className, delay }) => (
        <div
          key={label}
          className={"af-orbit-card absolute bg-background/90 text-foreground shadow-lg " + className}
          style={{ animationDelay: delay }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold">{label}</span>
        </div>
      ))}

      <div className="af-float absolute left-[12%] top-[46%] rounded-xl border bg-background/90 p-2.5 shadow-lg" style={{ animationDelay: ".5s" }}>
        <MapPinned className="h-5 w-5 text-primary" />
      </div>
      <div className="af-float absolute right-[12%] top-[47%] rounded-xl border bg-background/90 p-2.5 shadow-lg" style={{ animationDelay: "1.3s" }}>
        <FileCheck2 className="h-5 w-5 text-primary" />
      </div>

      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-[11px] font-semibold shadow-lg">
        <span className="h-2 w-2 rounded-full bg-primary" />
        Register
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        Locate
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        Verify
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        Report
      </div>
    </div>
  );
}

function PublicHome() {
  const { user } = useAuth();

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-reveal]"));
    if (!nodes.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

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
        <section className="relative overflow-hidden border-b" data-scroll-reveal data-reveal="hero">
          <div className="absolute inset-0 -z-20 bg-background" />
          <div className="absolute inset-0 -z-10 opacity-35 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px)] [background-size:46px_46px]" />
          <div className="absolute -right-32 top-12 -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-8 lg:py-22">
            <div className="af-scroll-copy">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Fixed asset control from registration to disposal
              </div>

              <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.045em] sm:text-5xl lg:text-[3.65rem] lg:leading-[1.02]">
                Every asset.
                <br />
                <span className="text-primary">One trusted system.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                AssetFlow 360 helps organisations register, locate, assign, verify, depreciate,
                move and report on fixed assets from one secure workspace built for daily operations
                and management decisions.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
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

            <div className="relative af-scroll-visual">
              <HeroAssetScene />
            </div>
          </div>
        </section>

        <section className="border-b bg-muted/25 af-scroll-reveal" data-scroll-reveal data-reveal="up">
          <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            <div className="af-stagger grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-4">
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

        <section id="features" data-scroll-reveal data-reveal="up" className="af-scroll-reveal mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
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

          <div className="af-stagger mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

        <section id="locations" data-scroll-reveal data-reveal="left" className="af-scroll-reveal border-y bg-muted/25">
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

        <section id="modules" data-scroll-reveal data-reveal="up" className="af-scroll-reveal mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Modules</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your asset team needs, grouped around real work.
            </h2>
          </div>

          <div className="af-stagger mt-10 grid gap-4 md:grid-cols-2">
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

        <section id="integrations" data-scroll-reveal data-reveal="right" className="af-scroll-reveal border-y bg-muted/25">
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

              <div className="af-stagger grid gap-4 sm:grid-cols-2">
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

        <section id="security" data-scroll-reveal data-reveal="left" className="af-scroll-reveal mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
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

        <section className="af-scroll-reveal border-t" data-scroll-reveal data-reveal="zoom">
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
