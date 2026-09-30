import { FormEvent, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Boxes, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { provisionFreeTrialWorkspace } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Start free trial — AssetFlow 360" },
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
        if (!data.session) {
          throw new Error("Your account was created but no session was returned. Please sign in to continue.");
        }
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
    <div className="grid min-h-screen bg-background lg:grid-cols-[.92fr_1.08fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,var(--sidebar-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--sidebar-border)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2.5 font-bold">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary"><Boxes className="h-5 w-5" /></span>
            AssetFlow 360
          </Link>
        </div>
        <div className="relative z-10 my-auto max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 px-3 py-1.5 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Private workspace from day one</span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight">Start managing assets without sharing a workspace with anyone else.</h1>
          <p className="mt-4 leading-7 text-sidebar-foreground/70">Your organization receives its own tenant boundary, administrator account and trial workspace.</p>
          <div className="mt-8 space-y-3 text-sm text-sidebar-foreground/80">
            {["No card required to register", "Core asset-management modules included in the trial", "Database-enforced tenant isolation", "Invite your team after setup"].map((item) => (
              <div key={item} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary"><Check className="h-3.5 w-3.5" /></span>{item}</div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-sidebar-foreground/50">AssetFlow 360 · Fixed asset management</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-lg">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
          <div className="mb-7 lg:hidden">
            <div className="flex items-center gap-2.5 font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Boxes className="h-5 w-5" /></span>AssetFlow 360</div>
          </div>

          <h2 className="text-3xl font-bold tracking-tight">Create your free trial</h2>
          <p className="mt-2 text-sm text-muted-foreground">Set up your organization's isolated workspace.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization name</Label>
              <Input id="organization" required autoFocus value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} placeholder="e.g. Acme Holdings Ltd" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your full name</Label>
              <Input id="name" required autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" disabled={Boolean(user)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" required={!user} minLength={8} type={showPwd ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pr-10" disabled={Boolean(user)} />
                  {!user && <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute inset-y-0 right-0 px-3 text-muted-foreground" aria-label={showPwd ? "Hide password" : "Show password"}>{showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" required={!user} minLength={8} type={showPwd ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={Boolean(user)} />
              </div>
            </div>
            <Button type="submit" size="lg" className="h-12 w-full" disabled={submitting}>
              {submitting ? "Creating workspace…" : <>Start free trial <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>
          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">By creating a workspace, you agree to use AssetFlow 360 for lawful business purposes and to protect the accounts you create.</p>
        </div>
      </main>
    </div>
  );
}
