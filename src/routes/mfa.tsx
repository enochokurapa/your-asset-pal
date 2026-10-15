import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect,useState,type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route=createFileRoute("/mfa")({component:MfaChallenge});
function MfaChallenge(){
 const {user,loading}=useAuth();
 const [factor,setFactor]=useState<string|null>(null);
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(!user)return;
  let active=true;
  (async()=>{
   const {data:levels,error:levelError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
   if(!active)return;
   if(levelError){setError(levelError.message);return;}
   if(levels.currentLevel==="aal2"||levels.nextLevel!=="aal2"){setReady(true);return;}
   const {data,error}=await supabase.auth.mfa.listFactors();
   if(!active)return;
   if(error){setError(error.message);return;}
   const existing=data?.totp?.find(f=>f.status==="verified");
   if(existing)setFactor(existing.id);
   else setError("No verified authenticator is available. Contact your administrator.");
  })();
  return ()=>{active=false;};
 },[user]);
 if(!loading&&!user)return <Navigate to="/login"/>;
 if(ready)return <Navigate to="/dashboard"/>;
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(!factor||busy||!/^[0-9]{6}$/.test(code))return;
  setBusy(true);setError("");
  const {data,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor});
  if(challengeError){setError(challengeError.message);setBusy(false);return;}
  const {error}=await supabase.auth.mfa.verify({factorId:factor,challengeId:data.id,code});
  setBusy(false);
  if(error){setError(error.message);return;}
  window.location.replace("/dashboard");
 };
 return <main className="min-h-screen bg-background px-4 py-12"><div className="mx-auto max-w-md space-y-7"><div className="flex justify-center"><PlatformLogo variant="lockup" className="h-16 w-64"/></div><section className="rounded-xl border bg-card p-7"><h1 className="text-xl font-semibold">Verify your sign-in</h1><p className="mt-2 text-sm text-muted-foreground">Enter the six-digit code shown in your authenticator app.</p><form onSubmit={submit} className="mt-6 space-y-4"><Label htmlFor="mfa-login-code">Authenticator code</Label><Input id="mfa-login-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} required/>{error&&<p className="text-sm text-destructive" role="alert">{error}</p>}<Button className="w-full" disabled={busy||!factor||code.length!==6}>{busy?"Verifying…":"Verify and continue"}</Button></form><Button variant="ghost" className="mt-4 w-full" onClick={async()=>{await supabase.auth.signOut();window.location.replace("/login")}}>Use another account</Button></section></div></main>;
}
