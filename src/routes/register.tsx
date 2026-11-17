import { FormEvent, useEffect, useState } from "react";
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
  const [verificationPending,setVerificationPending]=useState<string|null>(null);
  const [resending,setResending]=useState(false);
  useEffect(()=>{
    if(!user||tenantId)return;
    const metadata=user.user_metadata||{};
    setForm(current=>({
      ...current,
      full_name:current.full_name||String(metadata.full_name||""),
      organization_name:current.organization_name||String(metadata.organization_name||""),
      email:current.email||String(user.email||""),
    }));
  },[user?.id,tenantId]);
  const resendVerification=async()=>{
    if(!verificationPending||resending)return;
    setResending(true);
    try{
      const {error}=await supabase.auth.resend({type:"signup",email:verificationPending,options:{
        emailRedirectTo:window.location.origin+"/auth/confirm",
      }});
      if(error)throw error;
      toast.success("A new verification email has been requested.");
    }catch(err:any){toast.error(err.message||"Could not resend verification email")}
    finally{setResending(false)}
  };

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
          options: {
            data: { full_name: form.full_name.trim(), organization_name:form.organization_name.trim() },
            emailRedirectTo:window.location.origin+"/auth/confirm",
          },
        });
        if (error) throw error;
        if (!data.user) throw new Error("Account creation did not complete.");
        if (!data.session){
          setVerificationPending(form.email.trim());
          toast.success("Account created. Confirm your email to activate your workspace.");
          return;
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
    <div className="platform-brand af-auth-stage px-4 py-8 sm:py-10">



      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[530px] flex-col justify-center">
        <div className="af-auth-card border bg-white px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 flex items-center justify-between gap-2 border-b border-slate-100 pb-5">
            <span className="flex min-w-0 items-center gap-2">
             <PlatformLogo variant="mark" className="h-11 w-12 shrink-0"/>
             <span><span className="block text-[15px] font-bold tracking-tight text-[#172554]">AssetFlow360</span>
             <span className="block text-[11px] text-slate-500">Secure workspace access</span></span>
           </span>
            <Link to="/login" className="af-auth-link-home inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs text-[#4d5881]"><ArrowLeft className="h-3.5 w-3.5"/> Sign in</Link>
          </div>
          <div className="mb-6 text-left">
            <h1 className="text-2xl font-bold tracking-tight text-[#18275f]">{user&&!tenantId?"Complete your workspace":"Create your workspace"}</h1>
            <p className="mt-2 text-sm leading-6 text-[#5d6686]">Start your AssetFlow360 free trial. No card required.</p>
          </div>

          {verificationPending ? (
            <div role="status" className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-slate-800">
              <h2 className="text-lg font-bold text-indigo-900">Verify your email address</h2>
              <p>We sent an email confirmation link to <strong>{verificationPending}</strong>.</p>
              <p>Open that link to complete your workspace registration. You do not need to create another account.</p>
              <Button type="button" variant="outline" disabled={resending} onClick={()=>void resendVerification()}>
                {resending?"Sending…":"Resend verification email"}
              </Button>
              <p><Link className="font-semibold text-indigo-700 underline" to="/login">Already verified? Sign in</Link></p>
            </div>
          ) : <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  required
                  autoFocus
                  value={form.organization_name}
                  onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                  placeholder="Company name"
                  className="h-11 rounded-lg bg-background"
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
                  className="h-11 rounded-lg bg-background"
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
                className="h-11 rounded-lg bg-background"
              />
            </div>

            {!user && (
              <div className="grid gap-3 sm:grid-cols-2">
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
                      className="h-11 rounded-lg bg-background pr-10"
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
                    className="h-11 rounded-lg bg-background"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Minimum 8 characters. Your organisation gets its own isolated workspace.</p>

            <Button type="submit" className="h-11 w-full rounded-lg bg-[#3A3EC2] font-semibold text-white hover:bg-[#3034a8]" disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  Creating workspace
                </span>
              ) : "Start free trial"}
            </Button>
          </form>}

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
      </main>
    </div>
  );
}
