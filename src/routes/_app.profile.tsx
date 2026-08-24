import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserCircle, Bell, KeyRound } from "lucide-react";
import { ALL_APPROVAL_KINDS, type ApprovalKind } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, roles, isSaasAdmin, isTenantAdmin } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).single()).data,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    enabled: !isSaasAdmin,
    queryFn: async () => (await supabase.from("branches").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations-list"],
    enabled: !isSaasAdmin,
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    if (!isSaasAdmin) {
      const meta = (user?.user_metadata ?? {}) as any;
      setBranchId(meta.branch_id ?? "");
      setLocationId(meta.location_id ?? "");
    }
  }, [profile, user, isSaasAdmin]);

  const save = async () => {
    setSaving(true);
    const { error: pErr } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user!.id);
    const metadata = isSaasAdmin
      ? { full_name: fullName }
      : { full_name: fullName, branch_id: branchId || null, location_id: locationId || null };
    const { error: uErr } = await supabase.auth.updateUser({ data: metadata });
    setSaving(false);
    if (pErr || uErr) return toast.error((pErr ?? uErr)!.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
    qc.invalidateQueries({ queryKey: ["profiles-list"] });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">Update your profile and password.</p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><UserCircle className="h-7 w-7" /></div>
          <div>
            <p className="font-semibold">{user?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {!isSaasAdmin && (roles.length === 0 ? <Badge variant="outline">no role</Badge> : roles.map((r) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>))}
              {isTenantAdmin && <Badge variant="outline">Tenant admin</Badge>}
              {isSaasAdmin && <Badge>SaaS administrator</Badge>}
            </div>
          </div>
        </div>
        <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>

        {!isSaasAdmin && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={branchId || "none"} onValueChange={(v) => setBranchId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— None —</SelectItem>{branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationId || "none"} onValueChange={(v) => setLocationId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— None —</SelectItem>{locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </Card>

      <ChangePasswordCard />
      {!isSaasAdmin && <NotificationPrefsCard />}
    </div>
  );
}

function ChangePasswordCard() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const change = async () => {
    if (p1.length < 8) return toast.error("Password must be at least 8 characters");
    if (p1 !== p2) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1, data: { must_change_password: false } });
    setBusy(false);
    if (error) return toast.error(error.message);
    setP1(""); setP2("");
    toast.success("Password changed successfully");
  };
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div><div><h2 className="font-semibold">Change password</h2><p className="text-xs text-muted-foreground">You can change your password at any time.</p></div></div>
      <div className="space-y-2"><Label>New password</Label><Input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></div>
      <div className="space-y-2"><Label>Confirm new password</Label><Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></div>
      <Button onClick={change} disabled={busy}>{busy ? "Changing…" : "Change password"}</Button>
    </Card>
  );
}

function NotificationPrefsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: prefs = [] } = useQuery({
    queryKey: ["notif-prefs", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("user_notification_prefs" as any).select("approval_kind,in_app").eq("user_id", user!.id)).data ?? [],
  });
  const map = Object.fromEntries(prefs.map((p: any) => [p.approval_kind, p]));
  const toggle = async (kind: ApprovalKind, value: boolean) => {
    const { error } = await supabase.from("user_notification_prefs" as any).upsert({
      user_id: user!.id, approval_kind: kind, in_app: value, email: false,
    }, { onConflict: "user_id,approval_kind" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["notif-prefs", user?.id] });
  };
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Bell className="h-5 w-5" /></div><div><h2 className="font-semibold">In-app notifications</h2><p className="text-xs text-muted-foreground">Email delivery is not enabled at this stage.</p></div></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Approval kind</th><th className="py-2 text-center">In-app</th></tr></thead>
          <tbody>{ALL_APPROVAL_KINDS.map((k) => { const p = map[k] ?? { in_app: true }; return <tr key={k} className="border-b last:border-0"><td className="py-3 pr-3 capitalize">{k.replace(/_/g, " ")}</td><td className="py-3 text-center"><div className="flex justify-center"><Switch checked={!!p.in_app} onCheckedChange={(v) => toggle(k, v)} /></div></td></tr>; })}</tbody>
        </table>
      </div>
    </Card>
  );
}