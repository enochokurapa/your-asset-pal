import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { ArrowLeft, Boxes, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — AssetFlow 360" }] }),
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
      toast.success("Welcome back");
      window.location.assign("/dashboard");
    } catch (error) {
      console.error("[Login] Sign-in request failed", error);
      toast.error(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-2">
        <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-9 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Boxes className="h-5 w-5" /></span>
              <div><p className="font-bold">AssetFlow 360</p><p className="text-xs text-muted-foreground">Fixed asset management</p></div>
            </div>

            <h1 className="text-3xl font-bold tracking-tight">Sign in to your workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">Use your AssetFlow 360 account credentials.</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPwd ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                  <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground" aria-label={showPwd ? "Hide password" : "Show password"} tabIndex={-1}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" size="lg" className="h-12 w-full" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
            </form>

            <div className="mt-7 border-t pt-6 text-center">
              <p className="text-sm text-muted-foreground">New to AssetFlow 360?</p>
              <Button asChild variant="outline" className="mt-3 w-full"><Link to="/register">Start a free trial</Link></Button>
            </div>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-center">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,var(--sidebar-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--sidebar-border)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sidebar-primary">One asset control center</p>
            <h2 className="mt-4 text-4xl font-bold tracking-tight">Track ownership, movement, verification and value without losing the audit trail.</h2>
            <p className="mt-5 leading-7 text-sidebar-foreground/70">Your organization works inside its own tenant boundary with permissions layered on top.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
