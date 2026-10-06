import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { ArrowLeft, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
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

  if (/unexpected non-whitespace character after json|unexpected token.*json|failed to fetch|fetch failed|networkerror|upstream_(?:unreachable|misconfigured|not_configured)/i.test(raw)) {
    return "The sign-in service is temporarily unavailable. Please try again.";
  }
  return raw || "Sign in failed. Please try again.";
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
    <div className="platform-brand relative min-h-screen overflow-hidden bg-background px-4 py-8">
      <div className="af-login-orb absolute -right-24 top-[8%] h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="af-login-orb af-delay-2 absolute -left-24 bottom-[8%] h-72 w-72 rounded-full bg-secondary/25 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.32] [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--border)_75%,transparent)_1px,transparent_0)] [background-size:26px_26px]" />

      <Link to="/" className="af-auth-back absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground sm:left-6 sm:top-6">
        <ArrowLeft className="h-4 w-4" />
        Back to website
      </Link>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[470px] flex-col justify-center">
        <Link to="/" className="af-auth-logo mx-auto mb-7 inline-flex">
          <PlatformLogo variant="lockup" className="h-14 w-[250px] max-w-[78vw]" />
        </Link>

        <div className="af-auth-card rounded-[1.6rem] border bg-card/95 p-6 shadow-[0_28px_80px_-38px_rgba(0,0,0,.34)] backdrop-blur sm:p-8">
          <div className="mb-7 text-center">
            <p className="text-sm font-semibold text-primary">Welcome back</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Sign in to your workspace</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Continue to your asset register, locations, reports and operational controls.
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
              ) : "Sign in"}
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5 text-xs text-muted-foreground">
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
      </main>
    </div>
  );
}
