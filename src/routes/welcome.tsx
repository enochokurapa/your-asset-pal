import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { Boxes, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
});

function WelcomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!loading && !user) return <Navigate to="/login" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (p1.length < 6) return toast.error("Password must be at least 6 characters");
    if (p1 !== p2) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: p1,
      data: { must_change_password: false },
    });
    if (error) {
      setBusy(false);
      const msg = /different from the old/i.test(error.message)
        ? "Please choose a password different from your temporary one."
        : error.message;
      return toast.error(msg);
    }
    if (user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
    }
    // Refresh the session so the new password takes effect, then sign in fresh.
    try { await supabase.auth.refreshSession(); } catch { /* no-op */ }
    toast.success("Password updated — please sign in with your new password.");
    await supabase.auth.signOut();
    // Hard navigation so the auth context fully resets.
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    } else {
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Boxes className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to AssetFlow</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set a new password to continue.</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>New password</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} value={p1} onChange={(e) => setP1(e.target.value)} required className="pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground" tabIndex={-1} aria-label="Toggle">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm password</Label>
              <Input type={show ? "text" : "password"} value={p2} onChange={(e) => setP2(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
