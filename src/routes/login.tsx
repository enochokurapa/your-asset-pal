import {directAuthRest} from "@/lib/auth-direct-rest";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect, FormEvent } from "react";
import { ArrowLeft, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";
import {AuthVisualPanel} from "@/components/auth-visual-panel";
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
  const { user, session, loading, tenantId, isSaasAdmin, platformStaffRole, metadataStatus } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionVerificationPending,setSessionVerificationPending]=useState(false);
  const [unconfirmedEmail,setUnconfirmedEmail]=useState("");
  const [resending,setResending]=useState(false);
  const resendConfirmation=async()=>{
    if(!unconfirmedEmail)return;
    setResending(true);
    try{
      const {error}=await supabase.auth.resend({type:"signup",email:unconfirmedEmail,options:{
        emailRedirectTo:window.location.origin+"/auth/confirm"
      }});
      if(error)throw error;
      toast.success("A new confirmation email has been requested");
    }catch(err:any){toast.error(authErrorMessage(err))}
    finally{setResending(false)}
  };

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

  if (!loading && user && !submitting && !takeoverOpen && !sessionVerificationPending) {
    if(isSaasAdmin || tenantId) return <Navigate to="/dashboard" />;
    if(platformStaffRole) return <Navigate to="/platform-workspace" />;
    // Never send an existing sign-in to registration automatically.
  }

  const withTimeout=<T,>(promise:Promise<T>,timeoutMs:number):Promise<T>=>Promise.race([
    promise,
    new Promise<T>((_,reject)=>setTimeout(()=>reject(new Error("Unable to complete sign-in. Please try again.")),timeoutMs))
  ]);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (sessionVerificationPending && session?.access_token) {
      await retrySessionVerification();
      return;
    }
    setSubmitting(true);
    setSessionVerificationPending(true);
    setUnconfirmedEmail("");
    try {
      const { data:signInData,error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),25000);
      if (error) {
        setSessionVerificationPending(false);
        if(/email not confirmed/i.test(error.message))setUnconfirmedEmail(email.trim());
        toast.error(authErrorMessage(error));
        return;
      }
      const token=signInData.session?.access_token;
      if(!token)throw new Error("Further sign-in verification is required.");
      const other=await directAuthRest<Array<{session_id:string,device:string,last_seen:string}>>(
        "/rpc/other_login_sessions",token,"POST"
      );
      const devices=Array.isArray(other)?other as Array<{session_id:string,device:string,last_seen:string}>:[];
      if(devices.length){setExistingDevices(devices);setTakeoverOpen(true);return;}
      setSessionVerificationPending(false);
      window.location.assign("/dashboard");
    } catch (error) {
      console.error("[Login] Sign-in request failed", error);
      toast.error("Unable to complete sign-in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const retrySessionVerification=async()=>{
    if(submitting)return;
    setSubmitting(true);
    try{
      if(!session?.access_token)throw new Error("Please sign in to continue");
      const other=await directAuthRest<Array<{session_id:string,device:string,last_seen:string}>>(
        "/rpc/other_login_sessions",session.access_token,"POST"
      );
      const devices=Array.isArray(other)?other as Array<{session_id:string,device:string,last_seen:string}>:[];
      if(devices.length){setExistingDevices(devices);setTakeoverOpen(true);return;}
      setSessionVerificationPending(false);
      window.location.assign("/dashboard");
    }catch{
      toast.error("We couldn't confirm this device. Please retry.");
    }finally{setSubmitting(false);}
  };
  const replaceSession=async()=>{
    setSubmitting(true);
    try{
      if(!session?.access_token)throw new Error("Session missing");
      await directAuthRest<number>("/rpc/replace_other_login_sessions",session.access_token,"POST");
    }catch{
      toast.error("Could not sign out the other device.");
      setSubmitting(false);return;
    }
    setSessionVerificationPending(false);
    window.location.assign("/dashboard");
  };
  const cancelTakeover=async()=>{
    await supabase.auth.signOut({scope:"local"});
    setSessionVerificationPending(false);
    setTakeoverOpen(false);setExistingDevices([]);
  };
  return (
    <div className="platform-brand af-auth-stage af-auth-split px-0 py-0 lg:px-5 lg:py-8">


      {takeoverOpen&&<div role="dialog" aria-modal="true" aria-label="Existing sign-in" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-2xl bg-card p-7 shadow-xl"><h2 className="text-xl font-bold">Account already signed in</h2><p className="mt-3 text-sm text-muted-foreground">Your account is active on another device. Continue here and sign out the other device?</p><div className="my-4 rounded-xl border p-3 text-sm">{existingDevices.slice(0,3).map(item=><p key={item.session_id} className="truncate">{item.device || "Another browser"}</p>)}</div><p className="text-xs text-muted-foreground">The existing device will be notified when it next checks its session.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={cancelTakeover} disabled={submitting}>Keep other device</Button><Button onClick={replaceSession} disabled={submitting}>Sign out other device</Button></div></div></div>}
      <AuthVisualPanel/>
      <main className="af-auth-form-side relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[465px] flex-col justify-center">
        <div className="af-auth-card border bg-white px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 flex items-center justify-between gap-2 border-b border-slate-100 pb-5">
            <span className="flex min-w-0 items-center gap-2">
             <PlatformLogo variant="mark" className="h-11 w-12 shrink-0"/>
             <span><span className="block text-[15px] font-bold tracking-tight text-[#172554]">AssetFlow360</span>
             <span className="block text-[11px] text-slate-500">Secure workspace access</span></span>
           </span>
            <Link to="/" className="af-auth-link-home inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-[#4d5881] hover:bg-[#f7f5f3]"><ArrowLeft className="h-3.5 w-3.5"/> Home</Link>
          </div>
          <div className="mb-6 text-left">
            <h1 className="text-2xl font-bold tracking-tight text-[#18275f]">Welcome back</h1>

          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
            {unconfirmedEmail&&<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="mb-2 font-medium text-amber-900">Confirm your email before signing in.</p>
              <Button type="button" variant="outline" disabled={resending} onClick={()=>void resendConfirmation()}>
                {resending?"Sending…":"Resend verification email"}
              </Button>
            </div>}
          </form>

          {googleEnabled&&<>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/><span>or</span><span className="h-px flex-1 bg-border"/></div>
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl text-sm font-semibold" disabled={submitting} onClick={signInWithGoogle}>
              Continue with Google
            </Button>
          </>}


          <div className="mt-6 space-y-3 border-t pt-5 text-center">

            <Link to="/register" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#CB7B30] text-sm font-bold text-[#B56B25] hover:bg-[#fff5e9]">Create an account</Link>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[#777e93]">© {new Date().getFullYear()} AssetFlow360. All rights reserved.</p>
      </main>
    </div>
  );
}
