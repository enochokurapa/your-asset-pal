import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import {
  ArrowLeft, Boxes, Check, Eye, EyeOff, Laptop, MapPin, Package,
  ScanLine, ShieldCheck, Smartphone, Wifi,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in | AssetFlow 360" },
      { name: "description", content: "Sign in securely to your AssetFlow 360 fixed asset management workspace." },
    ],
  }),
});

function authErrorMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : error instanceof Error
        ? error.message
        : String(error ?? "");

  if (
    /unexpected non-whitespace character after json|unexpected token.*json|failed to fetch|fetch failed|networkerror|upstream_(?:unreachable|misconfigured|not_configured)/i.test(raw)
  ) {
    return "The sign-in service is temporarily unavailable. Please try again.";
  }
  return raw || "Sign in failed. Please try again.";
}

function LoginVisual() {
  const nodes = [
    { icon: Laptop, label: "Laptop", className: "left-[9%] top-[23%]", delay: "0s" },
    { icon: Smartphone, label: "Field device", className: "right-[9%] top-[18%]", delay: ".8s" },
    { icon: Package, label: "Equipment", className: "right-[12%] bottom-[18%]", delay: "1.5s" },
    { icon: MapPin, label: "Location", className: "left-[8%] bottom-[18%]", delay: "2.1s" },
  ];

  return (
    <div className="relative mx-auto aspect-[1.08/1] w-full max-w-[540px] overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.045]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 540 500" aria-hidden="true">
        <path className="af-flow-line" d="M58 158 C142 96, 188 112, 253 207" />
        <path className="af-flow-line af-delay-1" d="M482 139 C399 87, 355 112, 286 207" />
        <path className="af-flow-line af-delay-2" d="M469 390 C392 427, 348 369, 291 293" />
        <path className="af-flow-line af-delay-3" d="M65 394 C147 430, 196 370, 250 294" />
        <path className="af-wave-line" d="M-20 413 C89 353, 172 459, 286 405 C384 359, 460 431, 576 365" />
        <path className="af-wave-line af-delay-2" d="M-35 447 C80 397, 178 487, 286 442 C390 399, 463 465, 583 413" />
      </svg>

      <div className="absolute left-1/2 top-[47%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.045]" />
      <div className="absolute left-1/2 top-[47%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/30 bg-primary/10" />

      <div className="af-person-float absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2">
        <svg width="176" height="214" viewBox="0 0 176 214" role="img" aria-label="Field worker using a tablet">
          <circle cx="89" cy="42" r="28" fill="#d8a47f" />
          <path d="M65 36c6-29 49-35 56-2-12-7-22-10-34-9-7 1-14 4-22 11Z" fill="#282526" />
          <path d="M58 92c7-23 25-35 48-35s42 13 49 37l-10 64H68Z" fill="var(--platform-secondary, #4B47DC)" />
          <path d="M55 100c-18 19-27 44-31 67l18 4c6-24 13-41 27-54Z" fill="#d8a47f" />
          <path d="M150 98c18 21 24 45 25 67l-18 2c-3-23-8-41-21-55Z" fill="#d8a47f" />
          <rect x="66" y="104" width="78" height="57" rx="8" fill="#171717" />
          <rect x="72" y="110" width="66" height="45" rx="5" fill="#f8f8f7" />
          <circle cx="105" cy="133" r="8" fill="var(--platform-primary, #C77435)" />
          <path d="M101 133h8M105 129v8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M71 158h70l10 48H61Z" fill="#2c2a2b" />
          <path d="M82 158v48M129 158v48" stroke="#222" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>

      {nodes.map(({ icon: Icon, label, className, delay }) => (
        <div
          key={label}
          className={"af-orbit-card absolute " + className}
          style={{ animationDelay: delay }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-white/90">{label}</span>
        </div>
      ))}

      <div className="af-scan-pulse absolute left-1/2 top-[15%] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white/85 backdrop-blur">
        <ScanLine className="h-3.5 w-3.5 text-primary" />
        Asset verified
      </div>
    </div>
  );
}

function LoginPage() {
  const { user, loading, tenantId } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={tenantId ? "/dashboard" : "/register"} />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error(authErrorMessage(error));
        return;
      }
      window.location.assign("/dashboard");
    } catch (error) {
      console.error("[Login] Sign-in request failed", error);
      toast.error(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="platform-brand min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[1.04fr_.96fr]">
        <section className="relative hidden overflow-hidden bg-[#171515] p-10 text-white lg:flex lg:flex-col xl:p-14">
          <div className="absolute -left-24 top-16 h-72 w-72 rounded-full border border-white/5" />
          <div className="absolute -right-20 bottom-12 h-80 w-80 rounded-full border border-primary/20" />
          <div className="absolute inset-x-0 bottom-0 h-56 opacity-60 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.13)_1px,transparent_0)] [background-size:22px_22px]" />

          <Link to="/" className="relative z-10 inline-flex w-fit items-center">
            <PlatformLogo variant="lockup" className="h-12 w-[226px]" imageClassName="brightness-0 invert" />
          </Link>

          <div className="relative z-10 mt-10 max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Secure workspace access</p>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.035em] xl:text-5xl">
              Your asset operations,
              <span className="block text-primary">ready when you are.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/65">
              Sign in to manage the asset register, locations, verification, movements, depreciation, reports and approvals from one controlled workspace.
            </p>
          </div>

          <div className="relative z-10 mt-8 flex-1">
            <LoginVisual />
          </div>

          <div className="relative z-10 mt-7 grid grid-cols-3 gap-3">
            {[
              [ShieldCheck, "Secure access"],
              [Wifi, "Field ready"],
              [Boxes, "One asset register"],
            ].map(([Icon, label]) => {
              const C = Icon as typeof Boxes;
              return (
                <div key={String(label)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-white/70">
                  <C className="h-4 w-4 text-primary" />
                  {String(label)}
                </div>
              );
            })}
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-8 lg:px-12">
          <div className="af-login-orb absolute -right-24 top-[8%] h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
          <div className="af-login-orb af-delay-2 absolute -left-24 bottom-[10%] h-72 w-72 rounded-full bg-secondary/35 blur-3xl" />

          <div className="relative z-10 w-full max-w-[440px]">
            <div className="mb-8 lg:hidden">
              <Link to="/" className="inline-flex">
                <PlatformLogo variant="lockup" className="h-12 w-[220px] max-w-[72vw]" />
              </Link>
            </div>

            <Link to="/" className="mb-8 hidden w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground lg:inline-flex">
              <ArrowLeft className="h-4 w-4" />
              Back to website
            </Link>

            <div className="af-login-panel rounded-[1.65rem] border bg-card/95 p-6 shadow-[0_24px_70px_-30px_rgba(0,0,0,.28)] backdrop-blur sm:p-8">
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary lg:hidden">
                  <Boxes className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-primary">Welcome back</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Sign in to AssetFlow 360</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use your organisation account to continue.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="h-12 rounded-xl bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 rounded-xl bg-background pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition hover:text-foreground"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="h-12 w-full rounded-xl text-sm font-semibold" disabled={submitting}>
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                      Signing in
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              <div className="mt-6 flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                Secure workspace authentication
              </div>

              <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
                New to AssetFlow 360?{" "}
                <Link to="/register" className="font-semibold text-primary transition hover:opacity-80">
                  Start free trial
                </Link>
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {["Asset control", "Location intelligence", "Official reporting"].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
