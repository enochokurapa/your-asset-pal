import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route=createFileRoute("/mfa")({component:MfaChallenge});
function MfaChallenge(){
 const {user,loading,isSaasAdmin,isTenantAdmin,platformStaffRole}=useAuth();
 const [factor,setFactor]=useState<string|null>(null);
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [enrollment,setEnrollment]=useState<{factorId:string;qr:string;secret:string}|null>(null);
 const [enrolling,setEnrolling]=useState(false);
 const [error,setError]=useState("");
 const [method,setMethod]=useState<"choose"|"email"|"app">("choose");
 const [emailSent,setEmailSent]=useState(false);
 const [retrySeconds,setRetrySeconds]=useState(0);
 const [sendingEmail,setSendingEmail]=useState(false);
 const [emailFailed,setEmailFailed]=useState(false);
 const [registeredEmail,setRegisteredEmail]=useState("");
 const [rememberDevice,setRememberDevice]=useState(false);
 const [resolved,setResolved]=useState(false);
 const didAutoSend=useRef(false);
 const [verifiedFactor,setVerifiedFactor]=useState(false);
 useEffect(()=>{
  if(!user)return;
  let active=true;
  (async()=>{
   const {data:levels,error:levelError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
   if(!active)return;
   if(levelError){setError(levelError.message);return;}
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token){setError("Please sign in again");return;}
   const statusResponse=await fetch("/api/security/email-mfa/status",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
   if(!statusResponse.ok){setError("Verification temporarily unavailable");return;}
   const status=await statusResponse.json() as {verified?:boolean;registeredEmail?:string;preferredMethod?:"email"|"app"|null;hasAuthenticator?:boolean;pendingCode?:boolean;retryAfterSeconds?:number};
   if(!active)return;
   if(status.verified){setReady(true);return;}
   if(levels.nextLevel!=="aal2"&&!isSaasAdmin&&!isTenantAdmin&&!platformStaffRole){setReady(true);return;}
   setRegisteredEmail(status.registeredEmail||user.email||"");
   if(status.pendingCode){setEmailSent(true);setRetrySeconds(status.retryAfterSeconds||0);didAutoSend.current=true;}
   const {data,error}=await supabase.auth.mfa.listFactors();
   if(!active)return;
   if(error){setError(error.message);return;}
   const existing=data?.totp?.find(f=>f.status==="verified");
   if(existing){setFactor(existing.id);setVerifiedFactor(true);}else {setFactor(null);setVerifiedFactor(false);}
   // Existing authenticator owners go straight to their code field. A saved
   // explicit email preference takes precedence when the user changed methods.
   setMethod(status.preferredMethod==="email"?"email":existing?"app":status.preferredMethod==="app"?"app":"email");
   setResolved(true);
  })();
  return ()=>{active=false;};
 },[user?.id,isSaasAdmin,isTenantAdmin,platformStaffRole]);
 if(!loading&&!user)return <Navigate to="/login"/>;
 if(ready)return <Navigate to={platformStaffRole&&!isSaasAdmin?"/platform-workspace":"/dashboard"}/>;
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
 useEffect(()=>{
  if(!retrySeconds)return;
  const timer=window.setInterval(()=>setRetrySeconds(v=>Math.max(0,v-1)),1000);
  return ()=>window.clearInterval(timer);
 },[retrySeconds>0]);
 const emailAction=async(action:"send"|"verify")=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token){setError("Please sign in again");return false;}
  const response=await fetch("/api/security/email-mfa/"+action,{
   method:"POST",cache:"no-store",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
   body:action==="verify"?JSON.stringify({code}):"{}",
  });
  const result=await response.json().catch(()=>({})) as {error?:string;verified?:boolean;sent?:boolean;retryAfterSeconds?:number};
  if(result.retryAfterSeconds)setRetrySeconds(result.retryAfterSeconds);
  else if(!response.ok&&response.headers.get("retry-after"))setRetrySeconds(Number(response.headers.get("retry-after"))||0);
  if(!response.ok){setError(result.error||"Security verification unavailable");return false;}
  return true;
 };
 const sendEmail=async()=>{
  if(sendingEmail||busy)return;
  setSendingEmail(true);setEmailFailed(false);setError("");
  const ok=await emailAction("send");
  setSendingEmail(false);
  if(ok)setEmailSent(true);
  else setEmailFailed(true);
 };
 useEffect(()=>{
  if(!resolved||method!=="email"||didAutoSend.current||emailSent)return;
  didAutoSend.current=true;
  void sendEmail();
 },[resolved,method]);
 const saveSuccessfulMethod=async(chosen:"email"|"app")=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)return;
  await fetch("/api/security/email-mfa/remember",{
   method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
   credentials:"same-origin",body:JSON.stringify({method:chosen,remember:rememberDevice}),
  });
 };
 const verifyEmail=async(e:FormEvent)=>{
  e.preventDefault();if(busy||!/^[0-9]{6}$/.test(code))return;
  setBusy(true);setError("");
  const ok=await emailAction("verify");
  setBusy(false);
  if(ok){await saveSuccessfulMethod("email");window.location.replace(platformStaffRole&&!isSaasAdmin?"/platform-workspace":"/dashboard");}
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
  setEnrollment(null);await saveSuccessfulMethod("app");window.location.replace(platformStaffRole&&!isSaasAdmin?"/platform-workspace":"/dashboard");
 };
 return <main className="af-auth-stage min-h-screen px-4 py-8 sm:py-12"><div className="mx-auto max-w-md space-y-5"><div className="flex justify-center"><PlatformLogo variant="lockup" className="h-14 w-56"/></div><section className="rounded-xl border bg-white p-5 shadow-sm sm:p-7">
  <h1 className="text-xl font-semibold">Verify your sign-in</h1>
  <p className="mt-2 text-sm text-muted-foreground">{method==="app"?"Enter the code from your authenticator app.":method==="email"?"We send a code to your registered email.":"Choose your preferred verification method."}</p>
  {method==="choose"&&<div className="mt-5 space-y-3">
   <button type="button" onClick={()=>{setMethod("email");setError("");setEmailFailed(false);didAutoSend.current=false;setResolved(true)}} className="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-primary p-4 text-left hover:bg-primary/5"><span><strong className="block text-sm">Email verification code</strong><span className="mt-1 block text-xs text-muted-foreground">Recommended · Sent to your registered email</span></span><span className="text-xs font-semibold text-primary">Select</span></button>
   <button type="button" onClick={()=>{setMethod("app");setError("")}} className="flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left hover:bg-muted/40"><span><strong className="block text-sm">Authenticator app</strong><span className="mt-1 block text-xs text-muted-foreground">Use your authenticator's six-digit code</span></span><span className="text-xs font-semibold">Select</span></button>
  </div>}
  {method==="email"&&<div className="mt-5 space-y-4">
   <div className="rounded-lg border bg-[#f5f8fb] px-3 py-2.5 text-sm"><span className="block text-xs text-muted-foreground">Verification email</span><strong className="break-all">{registeredEmail||user?.email||"Your registered email"}</strong></div>
   {!emailSent?<div role="status" className="space-y-2"><p className="text-sm text-muted-foreground">{sendingEmail?"Sending your verification code…":emailFailed?"Unable to send the code.":"Preparing verification…"}</p>{emailFailed&&<Button variant="outline" className="w-full" onClick={sendEmail} disabled={retrySeconds>0}>{retrySeconds>0?`Retry in ${retrySeconds}s`:"Try sending again"}</Button>}</div>
   :<form onSubmit={verifyEmail} className="space-y-3"><p className="text-sm text-muted-foreground">Check your email. Code expires in 10 minutes.</p><Label htmlFor="email-mfa-code">Six-digit code</Label><Input id="email-mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} required/><Button className="w-full" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify and continue"}</Button></form>}
   {emailSent&&<Button variant="link" className="px-0 text-sm" disabled={sendingEmail||retrySeconds>0} onClick={sendEmail}>{retrySeconds>0?`Resend available in ${retrySeconds}s`:"Resend code"}</Button>}
  </div>}
  {method==="app"&&<div className="mt-5 space-y-3">
   {!factor&&!enrollment&&<Button className="w-full" onClick={enroll} disabled={enrolling}>{enrolling?"Preparing…":"Set up authenticator"}</Button>}
   {enrollment&&<div className="space-y-2"><p className="text-sm">Scan this QR code using an authenticator app.</p><img src={enrollment.qr} className="mx-auto h-44 w-44 bg-white p-2" alt="Authenticator enrollment QR code"/><p className="break-all text-xs">Manual setup key: <strong>{enrollment.secret}</strong></p></div>}
   {(factor||enrollment)&&<form onSubmit={submit} className="space-y-3"><Label htmlFor="mfa-login-code">Authenticator code</Label><Input id="mfa-login-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} required/><Button className="w-full" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify and continue"}</Button></form>}
  </div>}
  {method!=="choose"&&<label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={rememberDevice} onChange={e=>setRememberDevice(e.target.checked)} />Remember this device for 14 days</label>}
  {error&&<p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
  {method!=="choose"&&<Button variant="ghost" className="mt-3 w-full" onClick={()=>{setMethod("choose");setCode("");setError("")}}>Change verification method</Button>}
  <Button variant="ghost" className="mt-2 w-full" onClick={async()=>{await supabase.auth.signOut();window.location.replace("/login")}}>Use another account</Button>
 </section></div></main>;
}
