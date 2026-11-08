import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect, FormEvent } from "react";
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
  const [existingDevices,setExistingDevices]=useState<Array<{session_id:string,device:string,last_seen:string}>>([]);
  const [takeoverOpen,setTakeoverOpen]=useState(false);
  const [googleEnabled,setGoogleEnabled]=useState(false);
  useEffect(()=>{
    let active=true;
    fetch("/auth/v1/settings",{cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(settings=>{if(active)setGoogleEnabled(settings?.external?.google===true)})
      .catch(()=>{if(active)setGoogleEnabled(false)});
    return()=>{active=false};
  },[]);
  const signInWithGoogle=async()=>{
    if(submitting||!googleEnabled)return;
    setSubmitting(true);
    try{
      const {error}=await supabase.auth.signInWithOAuth({
        provider:"google",
        options:{redirectTo:window.location.origin+"/dashboard"},
      });
      if(error)throw error;
    }catch(err){toast.error(authErrorMessage(err));setSubmitting(false);}
  };
  useEffect(()=>{
    const displaced=sessionStorage.getItem("assetflow-session-replaced")==="1" || new URLSearchParams(window.location.search).has("session_replaced");
    if(displaced){sessionStorage.removeItem("assetflow-session-replaced");toast.warning("Your account was signed in on another device. This device has been signed out.");}
  },[]);

  if (!loading && user && !submitting && !takeoverOpen) return <Navigate to={tenantId ? "/dashboard" : "/register"} />;

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
      const {data:other,error:deviceError}=await supabase.rpc("other_login_sessions" as any);
      if(deviceError){await supabase.auth.signOut({scope:"local"});toast.error("Unable to verify active sessions. Please try again.");return;}
      const devices=Array.isArray(other)?other as Array<{session_id:string,device:string,last_seen:string}>:[];
      if(devices.length){setExistingDevices(devices);setTakeoverOpen(true);return;}
      window.location.assign("/dashboard");
    } catch (error) {
      console.error("[Login] Sign-in request failed", error);
      toast.error(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const replaceSession=async()=>{
    setSubmitting(true);
    const {error}=await supabase.rpc("replace_other_login_sessions" as any);
    if(error){toast.error("Could not sign out the other device.");setSubmitting(false);return;}
    window.location.assign("/dashboard");
  };
  const cancelTakeover=async()=>{
    await supabase.auth.signOut({scope:"local"});
    setTakeoverOpen(false);setExistingDevices([]);
  };
  return (
    <div className="platform-brand af-auth-stage px-4 py-8 sm:py-10">


      {takeoverOpen&&<div role="dialog" aria-modal="true" aria-label="Existing sign-in" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-2xl bg-card p-7 shadow-xl"><h2 className="text-xl font-bold">Account already signed in</h2><p className="mt-3 text-sm text-muted-foreground">Your account is active on another device. Continue here and sign out the other device?</p><div className="my-4 rounded-xl border p-3 text-sm">{existingDevices.slice(0,3).map(item=><p key={item.session_id} className="truncate">{item.device || "Another browser"}</p>)}</div><p className="text-xs text-muted-foreground">The existing device will be notified when it next checks its session.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={cancelTakeover} disabled={submitting}>Keep other device</Button><Button onClick={replaceSession} disabled={submitting}>Sign out other device</Button></div></div></div>}
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-[510px] flex-col justify-center">
        <div className="af-auth-card border bg-white p-6 sm:p-9">
          <div className="mb-5 flex items-start justify-between gap-3">
            <span className="inline-flex h-14 w-48 max-w-[60%] items-center"><PlatformLogo variant="lockup" className="h-full w-full" imageClassName="object-left object-contain"/></span>
            <Link to="/" className="af-auth-link-home inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-[#4d5881] hover:bg-[#f7f5f3]"><ArrowLeft className="h-3.5 w-3.5"/> Home</Link>
          </div>
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[#18275f] sm:text-3xl">Welcome back</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5d6686]">Sign in to your AssetFlow360 workspace</p>
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
                className="h-12 rounded-lg bg-white"
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
                  className="h-12 rounded-lg bg-white pr-11"
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

            <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link></div>
            <Button type="submit" className="h-12 w-full rounded-lg bg-[#3A3EC2] text-sm font-semibold text-white hover:bg-[#3034a8]" disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  Signing in
                </span>
              ) : "Sign in"}
            </Button>
          </form>

          {googleEnabled&&<>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/><span>or</span><span className="h-px flex-1 bg-border"/></div>
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl text-sm font-semibold" disabled={submitting} onClick={signInWithGoogle}>
              Continue with Google
            </Button>
          </>}
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#707b9b]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#3A3EC2]" /> Secure workspace sign-in
          </div>

          <div className="mt-6 space-y-3 border-t pt-5 text-center">
            <p className="text-xs text-[#727995]">New to AssetFlow360?</p>
            <Link to="/register" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#CB7B30] text-sm font-bold text-[#B56B25] hover:bg-[#fff5e9]">Create an account</Link>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[#777e93]">© {new Date().getFullYear()} AssetFlow360. All rights reserved.</p>
      </main>
    </div>
  );
}
