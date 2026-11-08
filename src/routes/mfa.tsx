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
 const {user,loading,isSaasAdmin,isTenantAdmin}=useAuth();
 const [factor,setFactor]=useState<string|null>(null);
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [enrollment,setEnrollment]=useState<{factorId:string;qr:string;secret:string}|null>(null);
 const [enrolling,setEnrolling]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(!user)return;
  let active=true;
  (async()=>{
   const {data:levels,error:levelError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
   if(!active)return;
   if(levelError){setError(levelError.message);return;}
   if(levels.currentLevel==="aal2"){setReady(true);return;}
   if(levels.nextLevel!=="aal2"&&!isSaasAdmin&&!isTenantAdmin){setReady(true);return;}
   const {data,error}=await supabase.auth.mfa.listFactors();
   if(!active)return;
   if(error){setError(error.message);return;}
   const existing=data?.totp?.find(f=>f.status==="verified");
   if(existing)setFactor(existing.id);
   else setFactor(null);
  })();
  return ()=>{active=false;};
 },[user?.id,isSaasAdmin,isTenantAdmin]);
 if(!loading&&!user)return <Navigate to="/login"/>;
 if(ready)return <Navigate to="/dashboard"/>;
 const enroll=async()=>{
  if(enrolling||factor)return;
  setEnrolling(true);setError("");
  const {data:existing}=await supabase.auth.mfa.listFactors();
  for(const item of existing?.totp??[]){
   if(item.status==="unverified")await supabase.auth.mfa.unenroll({factorId:item.id});
  }
  const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"AssetFlow360 Admin Authenticator"});
  setEnrolling(false);
  if(error){setError(error.message);return;}
  setEnrollment({factorId:data.id,qr:data.totp.qr_code,secret:data.totp.secret});
 };
 const submit=async(e:FormEvent)=>{
  e.preventDefault();const id=factor||enrollment?.factorId;
  if(!id||busy||!/^[0-9]{6}$/.test(code))return;
  setBusy(true);setError("");
  const {data,error:challengeError}=await supabase.auth.mfa.challenge({factorId:id});
  if(challengeError){setError(challengeError.message);setBusy(false);return;}
  const {error}=await supabase.auth.mfa.verify({factorId:id,challengeId:data.id,code});
  setBusy(false);
  if(error){setError(error.message);return;}
  setEnrollment(null);window.location.replace("/dashboard");
 };
 return <main className="min-h-screen bg-background px-4 py-12"><div className="mx-auto max-w-md space-y-7"><div className="flex justify-center"><PlatformLogo variant="lockup" className="h-16 w-64"/></div><section className="rounded-xl border bg-card p-7"><h1 className="text-xl font-semibold">{factor?"Verify your sign-in":"Set up required MFA"}</h1>
 <p className="mt-2 text-sm text-muted-foreground">{factor?"Enter the six-digit code from your authenticator.":"Administrators must set up an authenticator before accessing AssetFlow360."}</p>
 {!factor&&!enrollment&&<Button className="mt-5 w-full" onClick={enroll} disabled={enrolling}>{enrolling?"Preparing…":"Set up authenticator"}</Button>}
 {enrollment&&<div className="mt-5 space-y-2"><p className="text-sm">Scan this QR code using Google Authenticator or another TOTP app.</p><img src={enrollment.qr} className="mx-auto h-44 w-44 bg-white p-2" alt="Authenticator enrollment QR code"/><p className="break-all text-xs">Manual setup key: <strong>{enrollment.secret}</strong></p></div>}
 {(factor||enrollment)&&<form onSubmit={submit} className="mt-6 space-y-4"><Label htmlFor="mfa-login-code">Authenticator code</Label><Input id="mfa-login-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} required/><Button className="w-full" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify and continue"}</Button></form>}
 {error&&<p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}<Button variant="ghost" className="mt-4 w-full" onClick={async()=>{await supabase.auth.signOut();window.location.replace("/login")}}>Use another account</Button></section></div></main>;
}
