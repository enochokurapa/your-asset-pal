import { FormEvent, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { provisionFreeTrialWorkspace } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Start free trial | AssetFlow 360" },
      { name: "description", content: "Create your organization's isolated AssetFlow 360 workspace and start a free trial." },
    ],
  }),
});

function RegisterPage() {
  const { user, tenantId, loading } = useAuth();
  const provision = useServerFn(provisionFreeTrialWorkspace);
  const [form, setForm] = useState({ organization_name: "", full_name: "", email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && tenantId) return <Navigate to="/dashboard" />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!user && form.password.length < 8) return toast.error("Use at least 8 characters for your password.");
    if (!user && form.password !== confirmPassword) return toast.error("Passwords do not match.");

    setSubmitting(true);
    let createdNewAuthUser = false;
    try {
      if (!user) {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.full_name.trim() } },
        });
        if (error) throw error;
        if (!data.user) throw new Error("Account creation did not complete.");
        if (!data.session) throw new Error("Your account was created. Please sign in to continue.");
        createdNewAuthUser = true;
      }

      const headers = await getServerAuthHeaders();
      await provision({
        data: {
          organization_name: form.organization_name.trim(),
          full_name: form.full_name.trim(),
        },
        headers,
      });

      toast.success("Your free trial workspace is ready.");
      window.location.assign("/dashboard");
    } catch (error: any) {
      const message = error?.message || "Could not create your free trial.";
      if (createdNewAuthUser && /already belongs to a workspace/i.test(message)) {
        window.location.assign("/dashboard");
        return;
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="platform-brand relative min-h-screen overflow-hidden bg-background px-4 py-8">
      <div className="af-login-orb absolute -right-24 top-[7%] h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="af-login-orb af-delay-2 absolute -left-24 bottom-[7%] h-72 w-72 rounded-full bg-secondary/25 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.32] [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--border)_75%,transparent)_1px,transparent_0)] [background-size:26px_26px]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[560px] flex-col justify-center">
        <Link to="/" className="mx-auto mb-7 inline-flex">
          <PlatformLogo variant="lockup" className="h-14 w-[250px] max-w-[78vw]" />
        </Link>

        <div className="af-login-panel rounded-[1.6rem] border bg-card/95 p-6 shadow-[0_28px_80px_-38px_rgba(0,0,0,.34)] backdrop-blur sm:p-8">
          <div className="mb-7 text-center">
            <p className="text-sm font-semibold text-primary">Start with AssetFlow 360</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Create your workspace</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Set up an isolated asset management workspace for your organisation. No card required.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  required
                  autoFocus
                  value={form.organization_name}
                  onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                  placeholder="Company name"
                  className="h-11 rounded-xl bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  autoComplete="name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Your name"
                  className="h-11 rounded-xl bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@company.com"
                disabled={Boolean(user)}
                className="h-11 rounded-xl bg-background"
              />
            </div>

            {!user && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      required
                      minLength={8}
                      type={showPwd ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="h-11 rounded-xl bg-background pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3 text-muted-foreground transition hover:text-foreground"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    required
                    minLength={8}
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 rounded-xl bg-background"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Minimum 8 characters. Your organisation gets its own isolated workspace.</p>

            <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  Creating workspace
                </span>
              ) : "Start free trial"}
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            Secure, isolated organisation workspace
          </div>

          <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="font-semibold text-primary transition hover:opacity-80">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {["No card required", "Multi-branch ready", "Secure workspace"].map((item) => (
            <span key={item} className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" />
              {item}
            </span>
          ))}
        </div>

        <Link to="/" className="mx-auto mt-5 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to website
        </Link>
      </main>
    </div>
  );
}
