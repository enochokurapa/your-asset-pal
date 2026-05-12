import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

const ROLES: AppRole[] = ["admin", "manager", "staff"];

function UsersPage() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "staff" as AppRole });
  const [submitting, setSubmitting] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });

  if (loading) return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const create = async () => {
    if (!form.email || !form.password) { toast.error("Email and password required"); return; }
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSubmitting(true);
    // Sign-up creates account; trigger creates profile + 'staff' role.
    // Since session of admin is preserved by signing back in is awkward — we use signUp which doesn't auto-replace session
    // when called on existing client only if we don't sign-in. signUp does create a session if email is auto-confirmed.
    // To preserve admin session, we use a fresh client.
    const { createClient } = await import("@supabase/supabase-js");
    const tmp = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signed, error } = await tmp.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.full_name } },
    });
    if (error) { setSubmitting(false); toast.error(error.message); return; }

    // If chosen role is not 'staff', upgrade
    if (signed.user && form.role !== "staff") {
      const { error: rerr } = await supabase.from("user_roles").insert({ user_id: signed.user.id, role: form.role });
      if (rerr) toast.error("User created, but role assignment failed: " + rerr.message);
    }
    setSubmitting(false);
    toast.success("User created");
    setOpen(false);
    setForm({ email: "", password: "", full_name: "", role: "staff" });
    qc.invalidateQueries({ queryKey: ["users-with-roles"] });
  };

  const setRole = async (userId: string, role: AppRole, currentRoles: AppRole[]) => {
    if (currentRoles.includes(role)) {
      // remove
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["users-with-roles"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & responsibilities</h1>
          <p className="text-sm text-muted-foreground">Create accounts and assign roles.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><UserPlus className="mr-2 h-4 w-4" /> New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create user account</DialogTitle>
              <DialogDescription>The user will be able to sign in with this email & password.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Temporary password *</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Initial role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={submitting}>{submitting ? "Creating…" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <div className="py-12 text-center">
            <UsersIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No users yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((u: any) => (
              <div key={u.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{u.full_name || u.email}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => {
                    const on = u.roles.includes(r);
                    return (
                      <button
                        key={r}
                        onClick={() => setRole(u.id, r, u.roles)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
