import {useEffect,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {provisionFreeTrialWorkspace} from "@/lib/saas.functions";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {useServerFn} from "@tanstack/react-start";
import {PlatformLogo} from "@/components/platform-logo";
import {Button} from "@/components/ui/button";

export function ConfirmRegistration(){
 const [message,setMessage]=useState("Verifying your email…");
 const [failure,setFailure]=useState(false);
 const provision=useServerFn(provisionFreeTrialWorkspace);
 useEffect(()=>{
  let cancelled=false;
  const complete=async()=>{
   try{
    const query=new URLSearchParams(window.location.search);
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
    const error=query.get("error_description")||hash.get("error_description");
    if(error)throw Error(error);
    const code=query.get("code");
    const tokenHash=query.get("token_hash");
    const type=query.get("type");
    if(tokenHash){
      const otpType=type==="recovery"?"recovery":type==="invite"?"invite":type==="magiclink"?"magiclink":"signup";
      const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:otpType});
      if(error)throw error;
    }else if(code){
      const {error}=await supabase.auth.exchangeCodeForSession(code);
      if(error)throw error;
    }
    const {data:{session},error:sessionError}=await supabase.auth.getSession();
    if(sessionError)throw sessionError;
    if(!session?.user){
      if(!cancelled){setMessage("Your verification link has been processed. Please sign in to continue.");setFailure(true);}
      return;
    }
    const u=session.user;
    const company=String(u.user_metadata?.organization_name||"").trim();
    const name=String(u.user_metadata?.full_name||"").trim();
    if(!company||!name){
      window.location.replace("/register");
      return;
    }
    if(!cancelled)setMessage("Email verified. Activating your workspace…");
    try{
      await provision({data:{organization_name:company,full_name:name},headers:await getServerAuthHeaders()});
    }catch(err:any){
      if(!/already belongs to a workspace/i.test(String(err?.message||"")))throw err;
    }
    window.location.replace("/dashboard");
   }catch(err:any){
    if(cancelled)return;
    setMessage(err?.message||"We could not confirm your email. You can request a new verification email.");
    setFailure(true);
   }
  };
  void complete();
  return()=>{cancelled=true};
 },[]);
 return <main className="af-auth-stage flex min-h-screen items-center justify-center px-4">
  <div className="af-auth-card w-full max-w-md space-y-5 rounded-2xl border bg-white p-8 text-center shadow-sm">
   <PlatformLogo variant="lockup" className="mx-auto h-14 w-44"/>
   <h1 className="text-xl font-bold text-slate-900">Account verification</h1>
   <p role="status" className="text-sm leading-6 text-slate-600">{message}</p>
   {failure&&<div className="flex justify-center gap-3">
     <Button onClick={()=>window.location.assign("/login")}>Sign in</Button>
     <Button variant="outline" onClick={()=>window.location.assign("/register")}>Registration</Button>
   </div>}
  </div>
 </main>;
}
