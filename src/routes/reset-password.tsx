import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthPageFrame } from "@/components/auth-page-frame";
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
   }else if(url.hash.includes("type=recovery")){
    const {data}=await supabase.auth.getSession();
    if(mounted)setReady(Boolean(data.session));
   }else if(mounted){setError("Open the reset link from your email to continue.");}
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
 return <AuthPageFrame backTo="/login" backLabel="Sign in">
   <div className="mb-6">
     <h1 className="text-2xl font-bold tracking-tight text-[#172554]">{done?"Password updated":"Set a new password"}</h1>
     <p className="mt-2 text-sm leading-6 text-slate-600">
      {done?"Your new password is ready. You can sign in.":"Use at least 12 characters."}
     </p>
   </div>
   {ready&&!done&&<form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="new-password">New password</Label>
       <Input id="new-password" className="h-11" type="password" autoComplete="new-password" minLength={12}
        value={password} onChange={e=>setPassword(e.target.value)} required/></div>
      <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label>
       <Input id="confirm-password" className="h-11" type="password" autoComplete="new-password" minLength={12}
        value={confirm} onChange={e=>setConfirm(e.target.value)} required/></div>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={busy}>{busy?"Updating…":"Save new password"}</Button>
   </form>}
   {!ready&&!done&&<div role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
     {error||"Checking your secure reset link…"}
   </div>}
   {done&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
     <ShieldCheck className="mb-2 h-5 w-5"/>Your password was changed successfully.
   </div>}
   <p className="mt-6 border-t pt-5 text-center text-sm">
     <Link to={done?"/login":"/forgot-password"} className="font-semibold text-indigo-700">
       {done?"Return to sign in":"Request a new reset link"}
     </Link>
   </p>
 </AuthPageFrame>;
}
