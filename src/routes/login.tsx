import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in - AssetFlow 360" }] }),
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
      window.location.assign("/dashboard");
    } catch (error) {
      console.error("[Login] Sign-in request failed", error);
      toast.error(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="platform-brand min-h-screen bg-muted/25 px-4 py-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-center sm:min-h-[calc(100vh-5rem)]">
        <Link to="/" className="mx-auto mb-5">
          <PlatformLogo variant="lockup" className="h-9 w-[165px]" />
        </Link>

        <Card className="p-5 shadow-sm sm:p-6">
          <div className="mb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Access your AssetFlow 360 workspace.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-10 w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 border-t pt-4 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              Start free trial
            </Link>
          </p>
        </Card>

        <Link to="/" className="mx-auto mt-4 text-xs font-medium text-muted-foreground hover:text-foreground">
          Back to website
        </Link>
      </div>
    </div>
  );
}
