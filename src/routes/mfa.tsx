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
 const {user,session,loading,isSaasAdmin,isTenantAdmin,platformStaffRole}=useAuth();
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState("");
 const [emailSent,setEmailSent]=useState(false);
 const [retrySeconds,setRetrySeconds]=useState(0);
 const [sendingEmail,setSendingEmail]=useState(false);
 const [emailFailed,setEmailFailed]=useState(false);
 const [registeredEmail,setRegisteredEmail]=useState("");
 const [rememberDevice,setRememberDevice]=useState(false);
 const [resolved,setResolved]=useState(false);
 const didAutoSend=useRef(false);
 const lastAutoCode=useRef("");
 const [linkToken,setLinkToken]=useState("");
 useEffect(()=>{
  const match=/^#verify=([a-f0-9]{64})$/i.exec(window.location.hash);
  if(!match)return;
  setLinkToken(match[1]);
  window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
 },[]);
 useEffect(()=>{
  if(!user)return;
  let active=true;
  (async()=>{
   if(!session?.access_token){setError("Please sign in again");return;}
   const statusResponse=await fetch("/api/security/email-mfa/status",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},cache:"no-store",signal:AbortSignal.timeout(12000)});
   if(!statusResponse.ok){setError("Verification temporarily unavailable");return;}
   const status=await statusResponse.json() as {verified?:boolean;registeredEmail?:string;preferredMethod?:"email"|"app"|null;hasAuthenticator?:boolean;pendingCode?:boolean;retryAfterSeconds?:number};
   if(!active)return;
   if(status.verified){setReady(true);return;}
   setRegisteredEmail(status.registeredEmail||user.email||"");
   if(status.pendingCode){setEmailSent(true);setRetrySeconds(status.retryAfterSeconds||0);didAutoSend.current=true;}
   setResolved(true);
  })().catch(()=>{if(active){setError("Verification temporarily unavailable. Please retry.");setResolved(true);}});
  return ()=>{active=false;};
 },[user?.id,session?.access_token,isSaasAdmin,isTenantAdmin,platformStaffRole]);
 useEffect(()=>{
  if(!retrySeconds)return;
  const timer=window.setInterval(()=>setRetrySeconds(v=>Math.max(0,v-1)),1000);
  return ()=>window.clearInterval(timer);
 },[retrySeconds>0]);
 const emailAction=async(action:"send"|"verify")=>{
  if(!session?.access_token){setError("Please sign in again");return false;}
  try{
   const response=await fetch("/api/security/email-mfa/"+action,{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:action==="verify"?JSON.stringify({code}):"{}",
    signal:AbortSignal.timeout(15000),
   });
   const result=await response.json().catch(()=>({})) as {error?:string;retryAfterSeconds?:number};
   if(result.retryAfterSeconds)setRetrySeconds(result.retryAfterSeconds);
   else if(!response.ok&&response.headers.get("retry-after"))setRetrySeconds(Number(response.headers.get("retry-after"))||0);
   if(!response.ok){setError(result.error||"Security verification unavailable");return false;}
   return true;
  }catch{
   setError("Connection interrupted. Retry sending or enter the code already received.");
   return false;
  }
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
  if(!resolved||didAutoSend.current||emailSent)return;
  didAutoSend.current=true;
  void sendEmail();
 },[resolved]);
 const saveSuccessfulMethod=async(chosen:"email"|"app")=>{
  if(!session?.access_token)return;
  try{
   await fetch("/api/security/email-mfa/remember",{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    credentials:"same-origin",body:JSON.stringify({method:chosen,remember:rememberDevice}),
    signal:AbortSignal.timeout(8000),
   });
  }catch{/* Verification succeeded; saving this optional preference may fail. */}
 };
 const verifyEmailCode=async()=>{
  if(busy||!/^[0-9]{6}$/.test(code))return;
  setBusy(true);setError("");
  const ok=await emailAction("verify");
  setBusy(false);
  if(ok){await saveSuccessfulMethod("email");window.location.replace(platformStaffRole&&!isSaasAdmin?"/platform-workspace":"/dashboard");}
 };
 const verifyEmail=(e:FormEvent)=>{e.preventDefault();void verifyEmailCode();};
 useEffect(()=>{
  if(!resolved||!emailSent||busy||code.length!==6){
   if(code.length!==6)lastAutoCode.current="";
   return;
  }
  if(lastAutoCode.current===code)return;
  lastAutoCode.current=code;
  void verifyEmailCode();
 },[code,resolved,emailSent,busy]);
 useEffect(()=>{
  if(!linkToken||!resolved||!session?.access_token)return;
  const token=linkToken;
  let active=true;
  (async()=>{
   setBusy(true);setError("");
   try{
    const response=await fetch("/api/security/email-mfa/link",{
     method:"POST",cache:"no-store",
     headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
     body:JSON.stringify({token}),signal:AbortSignal.timeout(15000),
    });
    const result=await response.json().catch(()=>({})) as {error?:string};
    if(!response.ok)throw new Error(result.error||"Link verification failed");
    if(!active)return;
    await saveSuccessfulMethod("email");
    window.location.replace(platformStaffRole&&!isSaasAdmin?"/platform-workspace":"/dashboard");
   }catch{
    if(active)setError("This one-tap link could not be verified in this browser. Enter the code from your email instead.");
   }finally{if(active)setBusy(false);}
  })();
  return()=>{active=false;};
 },[linkToken,resolved,session?.access_token]);
 if(!loading&&!user)return <Navigate to="/login"/>;
 if(ready)return <Navigate to={platformStaffRole&&!isSaasAdmin?"/platform-workspace":"/dashboard"}/>;
 return <main className="platform-brand af-auth-stage min-h-screen px-4 py-8 sm:py-12"><div className="mx-auto max-w-md space-y-5"><div className="flex justify-center"><PlatformLogo variant="lockup" className="h-14 w-56"/></div><section className="rounded-xl border bg-white p-5 shadow-sm sm:p-7">
  <h1 className="text-xl font-semibold">Verify your sign-in</h1>
  <p className="mt-2 text-sm text-muted-foreground">Enter the six-digit code sent to your registered email.</p>
  <div className="mt-5 space-y-4">
   <div className="rounded-lg border bg-[#f5f8fb] px-3 py-2.5 text-sm"><span className="block text-xs text-muted-foreground">Verification email</span><strong className="break-all">{registeredEmail||user?.email||"Your registered email"}</strong></div>
   <form onSubmit={verifyEmail} className="space-y-3">
    <p className="text-sm text-muted-foreground" role="status">{sendingEmail?"Sending your code…":emailFailed?"Delivery is delayed. You can retry below; the code field stays ready.":emailSent?"Code requested. Check email for your code or one-tap verification link.":"Preparing verification. You can enter the code at any time."}</p>
    <Label htmlFor="email-mfa-code">Six-digit verification code</Label>
    <Input id="email-mfa-code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" autoFocus value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} placeholder="000000" className="h-12 text-center text-xl tracking-[.32em]" aria-label="Six-digit email verification code" required/>
    <Button type="submit" className="w-full" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify and continue"}</Button>
   </form>
   {emailFailed&&<Button variant="outline" className="w-full" onClick={sendEmail} disabled={sendingEmail||retrySeconds>0}>{retrySeconds>0?"Retry in "+retrySeconds+"s":"Try sending again"}</Button>}
   <Button variant="link" className="px-0 text-sm" disabled={sendingEmail||retrySeconds>0} onClick={sendEmail}>{retrySeconds>0?`Resend available in ${retrySeconds}s`:"Resend code"}</Button>
  </div>
  <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={rememberDevice} onChange={e=>setRememberDevice(e.target.checked)} />Remember this device for 14 days</label>
  {error&&<p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
  <Button variant="ghost" className="mt-2 w-full" onClick={async()=>{await supabase.auth.signOut();window.location.replace("/login")}}>Use another account</Button>
 </section></div></main>;
}
