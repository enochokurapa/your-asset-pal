import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword(){
 const [ready,setReady]=useState(false),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let mounted=true;
  const initialize=async()=>{
   const url=new URL(window.location.href);
   const tokenHash=url.searchParams.get("token_hash");
   if(tokenHash&&url.searchParams.get("type")==="recovery"){
    const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:"recovery"});
    if(mounted){setReady(!error);if(error)setError("This reset link is invalid or expired. Request a new link.");}
   }else{
    const {data}=await supabase.auth.getSession();
    if(mounted)setReady(Boolean(data.session));
   }
  };
  initialize();
  const {data:listener}=supabase.auth.onAuthStateChange(event=>{if(mounted&&event==="PASSWORD_RECOVERY")setReady(true);});
  return ()=>{mounted=false;listener.subscription.unsubscribe();};
 },[]);
 const submit=async(e:FormEvent)=>{
  e.preventDefault();
  if(password.length<12){setError("Use at least 12 characters.");return;}
  if(password!==confirm){setError("Passwords do not match.");return;}
  setBusy(true);setError("");
  const {error}=await supabase.auth.updateUser({password});
  if(error){setError(error.message);setBusy(false);return;}
  await supabase.auth.signOut();
  setDone(true);setBusy(false);
 };
 return <main className="min-h-screen bg-background px-4 py-12"><div className="mx-auto max-w-md space-y-7"><div className="flex justify-center"><PlatformLogo variant="lockup" className="h-16 w-64"/></div><section className="rounded-2xl border bg-card p-7 shadow-sm"><div className="mb-5 flex justify-center text-primary">{done?<ShieldCheck className="h-9 w-9"/>:<KeyRound className="h-9 w-9"/>}</div><h1 className="text-center text-2xl font-semibold">{done?"Password updated":"Create a new password"}</h1><p className="mt-2 text-center text-sm text-muted-foreground">{done?"Your password was changed. Sign in using your new credentials.":"Your new password must have at least 12 characters."}</p>{ready&&!done&&<form className="mt-6 space-y-4" onSubmit={submit}><div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div><div><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy?"Updating…":"Set new password"}</Button></form>}{!ready&&!done&&<p className="mt-5 text-center text-sm text-muted-foreground">{error||"Checking your secure reset link…"}</p>}<Link to={done?"/login":"/forgot-password"} className="mt-6 block text-center text-sm font-medium text-primary">{done?"Return to sign in":"Request another reset link"}</Link></section></div></main>;
}
