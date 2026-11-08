import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {PlatformLogo} from "@/components/platform-logo";
import {ShieldCheck} from "lucide-react";

export const Route=createFileRoute("/confirm-login-email")({component:ConfirmLoginEmail,head:()=>({meta:[{title:"Confirm login email | AssetFlow360"},{name:"robots",content:"noindex,nofollow,noarchive"}]})});
function ConfirmLoginEmail(){
 const [busy,setBusy]=useState(false);const [result,setResult]=useState<string|null>(null);const [success,setSuccess]=useState(false);
 const confirm=async()=>{
  if(busy)return;
  const token=window.location.hash.match(/^#token=([a-f0-9]{64})$/)?.[1];
  if(!token){setResult("This verification link is missing or invalid.");return;}
  setBusy(true);
  try{
   const response=await fetch("/api/security/confirm-login-email",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
   const data=await response.json() as {message?:string};
   setResult(data.message||"Could not confirm this request.");
   setSuccess(response.ok);
   if(response.ok)window.history.replaceState(null,"","/confirm-login-email");
  }catch{setResult("Connection unavailable. Try again.");}
  finally{setBusy(false);}
 };
 return <main className="flex min-h-screen items-center justify-center bg-[#e2eaf0] px-4 py-8"><div className="w-full max-w-md space-y-5"><div className="flex justify-center"><PlatformLogo variant="lockup" className="h-14 w-56"/></div><section className="space-y-5 rounded-xl border bg-white p-7 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h1 className="text-xl font-bold">Confirm your login email</h1></div><p className="text-sm text-muted-foreground">A SaaS administrator requested this email correction. Only confirm if the account belongs to you and you recognize the request.</p>{result?<p role="status" className={success?"text-sm text-emerald-700":"text-sm text-destructive"}>{result}</p>:<Button className="w-full" onClick={confirm} disabled={busy}>{busy?"Confirming…":"Confirm email change"}</Button>}{success?<Button asChild variant="outline" className="w-full"><Link to="/login">Sign in with new email</Link></Button>:<p className="text-xs text-muted-foreground">If you did not request this, leave this page without confirming.</p>}</section></div></main>;
}
