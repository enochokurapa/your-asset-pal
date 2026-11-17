import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { MailCheck, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthPageFrame } from "@/components/auth-page-frame";
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
  return <AuthPageFrame backTo="/login" backLabel="Sign in">
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-[#172554]">{sent?"Check your inbox":"Forgot password?"}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{sent?"If your email is registered, you will receive a secure reset link.":"Enter your account email to receive a reset link."}</p>
    </div>
    {!sent?<form onSubmit={submit} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="reset-email">Email address</Label>
       <Input id="reset-email" className="h-11" autoComplete="email" type="email" value={email}
        onChange={e=>setEmail(e.target.value)} required placeholder="you@company.com"/></div>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={busy}>{busy?"Sending…":"Send reset link"}</Button>
    </form>:<div className="space-y-4">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
       <MailCheck className="mb-2 h-5 w-5"/>Check your inbox and spam folder.</div>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={()=>setSent(false)}>Use another email</Button>
    </div>}
    <p className="mt-6 border-t pt-5 text-center text-sm text-slate-600">
      Remember your password? <Link to="/login" className="font-semibold text-indigo-700">Sign in</Link>
    </p>
  </AuthPageFrame>;
}
