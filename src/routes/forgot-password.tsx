import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { MailCheck, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformLogo } from "@/components/platform-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword });

function ForgotPassword() {
  const [email,setEmail]=useState("");
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(busy)return;setBusy(true);setError("");
    try{
      const result=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{
        redirectTo:window.location.origin+"/reset-password"
      });
      if(result.error)throw result.error;
      setSent(true);
    }catch{
      // Account existence must not be disclosed.
      setSent(true);
    }finally{setBusy(false);}
  };
  return <main className="relative min-h-screen bg-muted/20 px-4 py-12"><div className="mx-auto max-w-md space-y-7"><section className="rounded-2xl border bg-card p-7 shadow-sm"><div className="mb-5 flex flex-col items-center gap-3"><PlatformLogo variant="lockup" className="h-20 w-64"/><Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Back to sign in</Link></div><div className="mb-5 flex justify-center text-primary"><MailCheck className="h-9 w-9"/></div><h1 className="text-center text-2xl font-semibold">{sent?"Check your email":"Reset your password"}</h1><p className="mt-2 text-center text-sm text-muted-foreground">{sent?"If an account exists for that address, a password reset link has been sent. Check spam too. Links expire.":"Enter your account email and we'll send a secure, time-limited reset link. Your existing password will never be emailed."}</p>{!sent&&<form onSubmit={submit} className="mt-7 space-y-4"><div className="space-y-2"><Label htmlFor="reset-email">Account email</Label><Input id="reset-email" autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@company.com"/></div>{error&&<p className="text-sm text-destructive">{error}</p>}<Button className="w-full" disabled={busy}>{busy?"Sending…":"Send reset link"}</Button></form>}{sent&&<Button variant="outline" className="mt-6 w-full" onClick={()=>setSent(false)}>Try another address</Button>}</section><p className="text-center text-sm text-muted-foreground">Forgot which email you registered with? Ask your organization's administrator to verify your account using your registered identity. For privacy, we do not reveal email addresses publicly.</p></div></main>;
}
