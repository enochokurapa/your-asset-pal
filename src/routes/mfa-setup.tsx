import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MfaSettingsCard } from "@/components/mfa-settings-card";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";

export const Route = createFileRoute("/mfa-setup")({ component: MfaSetupPage });

function MfaSetupPage() {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [nextStep, setNextStep] = useState<"setup"|"verify"|"ready">("setup");
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data: levels, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (!error && levels?.currentLevel === "aal2") {
        setNextStep("ready");
      } else {
        const { data } = await supabase.auth.mfa.listFactors();
        setNextStep(data?.totp?.some(f => f.status === "verified") ? "verify" : "setup");
      }
      setChecking(false);
    })();
    return () => { active = false; };
  }, [user?.id]);
  if (loading || checking && user) {
    return <div className="flex min-h-screen items-center justify-center">Checking administrator security requirements…</div>;
  }
  if (!user) return <Navigate to="/login" />;
  if (nextStep === "ready") return <Navigate to="/dashboard" />;
  if (nextStep === "verify") return <Navigate to="/mfa" />;
  return <main className="min-h-screen bg-background px-5 py-12">
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex justify-center"><PlatformLogo variant="lockup" className="h-16 w-64" /></div>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Secure your administrator account</h1>
        <p className="text-sm text-muted-foreground">
          Set up and verify an authenticator app before accessing sensitive platform settings.
          Enrollment is required only for administrator roles.
        </p>
      </header>
      <MfaSettingsCard required onVerified={() => window.location.replace("/dashboard")} />
      <Button variant="outline" className="w-full" onClick={async () => {
        await supabase.auth.signOut(); window.location.replace("/login");
      }}>Sign out</Button>
    </div>
  </main>;
}
