import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

type TotpEnrollment = { factorId: string; qr: string; secret: string };
export function MfaSettingsCard() {
  const [enrollment,setEnrollment]=useState<TotpEnrollment|null>(null);
  const [code,setCode]=useState("");
  const [enabled,setEnabled]=useState<{id:string;friendly_name?:string}[]>([]);
  const [busy,setBusy]=useState(false);
  const refresh=async()=>{
    const {data,error}=await supabase.auth.mfa.listFactors();
    if(error){toast.error(error.message);return;}
    setEnabled((data?.totp??[]).filter(f=>f.status==="verified").map(f=>({id:f.id,friendly_name:f.friendly_name})));
  };
  useEffect(()=>{void refresh();},[]);
  const enroll=async()=>{
    setBusy(true);
    const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"AssetFlow360 Authenticator"});
    setBusy(false);
    if(error){toast.error(error.message);return;}
    setEnrollment({factorId:data.id,qr:data.totp.qr_code,secret:data.totp.secret});
  };
  const verify=async()=>{
    if(!enrollment||!/^[0-9]{6}$/.test(code)){toast.error("Enter the six-digit code from your authenticator.");return;}
    setBusy(true);
    const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:enrollment.factorId});
    if(challengeError){setBusy(false);toast.error(challengeError.message);return;}
    const {error}=await supabase.auth.mfa.verify({factorId:enrollment.factorId,challengeId:challenge.id,code});
    setBusy(false);
    if(error){toast.error(error.message);return;}
    setEnrollment(null);setCode("");await refresh();
    toast.success("Authenticator verification enabled.");
  };
  const remove=async(id:string)=>{
    if(!window.confirm("Remove this authentication factor? Verify your identity before changing security settings."))return;
    setBusy(true);
    const {error}=await supabase.auth.mfa.unenroll({factorId:id});
    setBusy(false);
    if(error){toast.error(error.message);return;}await refresh();
    toast.success("Authentication factor removed.");
  };
  return <Card className="space-y-4 p-6">
    <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-primary"/><div><h2 className="font-semibold">Two-factor authentication</h2><p className="text-xs text-muted-foreground">Protect your account with a time-based authenticator code.</p></div></div>
    {enabled.map(f=><div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm">Authenticator enabled · {f.friendly_name??"TOTP"}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>remove(f.id)}>Remove factor</Button></div>)}
    {enrollment?<div className="space-y-3 rounded-lg border p-4"><p className="text-sm">Scan this code in your authenticator app. Keep the secret private.</p><img src={enrollment.qr} className="h-44 w-44 bg-white p-2" alt="Authenticator app QR code"/><p className="break-all text-xs">Manual key: <strong>{enrollment.secret}</strong></p><Label htmlFor="mfa-code">Six-digit code</Label><Input id="mfa-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code"/><div className="flex gap-2"><Button onClick={verify} disabled={busy||code.length!==6}>Confirm and enable</Button><Button variant="outline" onClick={()=>setEnrollment(null)}>Cancel</Button></div></div>:<Button variant="outline" disabled={busy} onClick={enroll}>Add authenticator app</Button>}
    <p className="text-xs text-muted-foreground">Email recovery and organization-wide enforcement are configured separately. Never share authentication codes.</p>
  </Card>;
}
