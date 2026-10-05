import { FormEvent, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { provisionFreeTrialWorkspace } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Start free trial - AssetFlow 360" },
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
    <div className="platform-brand min-h-screen bg-muted/25 px-4 py-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col justify-center sm:min-h-[calc(100vh-4rem)]">
        <Link to="/" className="mx-auto mb-4">
          <PlatformLogo variant="lockup" className="h-9 w-[165px]" />
        </Link>

        <Card className="p-5 shadow-sm sm:p-6">
          <div className="mb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Start your free trial</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create your organization workspace. No card required.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  required
                  autoFocus
                  value={form.organization_name}
                  onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                  placeholder="Company name"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  autoComplete="name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Your name"
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
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
                className="h-10"
              />
            </div>

            {!user && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
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
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3 text-muted-foreground"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    required
                    minLength={8}
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Minimum 8 characters. Your organization gets its own isolated workspace.</p>

            <Button type="submit" className="h-10 w-full" disabled={submitting}>
              {submitting ? "Creating workspace…" : "Start free trial"}
            </Button>
          </form>

          <p className="mt-5 border-t pt-4 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
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
