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
import { UserCircle, Bell } from "lucide-react";
import { ALL_APPROVAL_KINDS, type ApprovalKind } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).single()).data,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    queryFn: async () => (await supabase.from("branches").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations-list"],
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      const meta = (user?.user_metadata ?? {}) as any;
      setBranchId(meta.branch_id ?? "");
      setLocationId(meta.location_id ?? "");
    }
  }, [profile, user]);

  const save = async () => {
    setSaving(true);
    const { error: pErr } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user!.id);
    const { error: uErr } = await supabase.auth.updateUser({
      data: { full_name: fullName, branch_id: branchId || null, location_id: locationId || null },
    });
    setSaving(false);
    if (pErr || uErr) { toast.error((pErr ?? uErr)!.message); return; }
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
    qc.invalidateQueries({ queryKey: ["profiles-list"] });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">Update your personal details. Roles are managed by an administrator.</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserCircle className="h-7 w-7" />
          </div>
          <div>
            <p className="font-semibold">{user?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.length === 0 ? <Badge variant="outline">no role</Badge> : roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={branchId || "none"} onValueChange={(v) => setBranchId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={locationId || "none"} onValueChange={(v) => setLocationId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </Card>

      <NotificationPrefsCard />
    </div>
  );
}

function NotificationPrefsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: prefs = [] } = useQuery({
    queryKey: ["notif-prefs", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("user_notification_prefs" as any)
      .select("approval_kind,in_app,email").eq("user_id", user!.id)).data ?? [],
  });
  const map = Object.fromEntries(prefs.map((p: any) => [p.approval_kind, p]));

  const toggle = async (kind: ApprovalKind, channel: "in_app" | "email", value: boolean) => {
    const existing = map[kind] ?? { approval_kind: kind, in_app: true, email: false };
    const next = { ...existing, [channel]: value };
    const { error } = await supabase.from("user_notification_prefs" as any).upsert({
      user_id: user!.id,
      approval_kind: kind,
      in_app: next.in_app,
      email: next.email,
    }, { onConflict: "user_id,approval_kind" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["notif-prefs", user?.id] });
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">Notification settings</h2>
          <p className="text-xs text-muted-foreground">
            Choose which approval events alert you in-app and via email.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3">Approval kind</th>
              <th className="py-2 pr-3 text-center">In-app</th>
              <th className="py-2 text-center">Email</th>
            </tr>
          </thead>
          <tbody>
            {ALL_APPROVAL_KINDS.map((k) => {
              const p = map[k] ?? { in_app: true, email: false };
              return (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-3 pr-3 capitalize">{k.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-3 text-center">
                    <div className="flex justify-center">
                      <Switch checked={!!p.in_app} onCheckedChange={(v) => toggle(k, "in_app", v)} />
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <div className="flex justify-center">
                      <Switch checked={!!p.email} onCheckedChange={(v) => toggle(k, "email", v)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Email alerts require email infrastructure to be enabled for this workspace; the toggle is stored either way.
      </p>
    </Card>
  );
}
