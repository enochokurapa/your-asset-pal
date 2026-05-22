import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole, ALL_MODULES, ALL_APPROVAL_KINDS, ALL_ACTION_KINDS, ModuleKey, ApprovalKind, ActionKind } from "@/hooks/use-auth";
import {
  createUserAccount, adminResetPassword, setUserActive, deleteUserAccount,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Users as UsersIcon, KeyRound, Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

const ROLES: AppRole[] = ["admin", "manager", "staff"];

function UsersPage() {
  const { isAdmin, loading, user: me } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "staff" as AppRole });
  const [submitting, setSubmitting] = useState(false);

  const createFn = useServerFn(createUserAccount);
  const resetFn = useServerFn(adminResetPassword);
  const activeFn = useServerFn(setUserActive);
  const deleteFn = useServerFn(deleteUserAccount);

  const { data: branchesAll = [] } = useQuery({
    queryKey: ["branches-all-for-perms"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("branches").select("id,name,code").order("name")).data ?? [],
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, { data: perms }, { data: rights }, { data: acts }, { data: brs }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_permissions" as any).select("user_id, module, can_view"),
        supabase.from("user_approval_rights" as any).select("user_id, approval_kind"),
        supabase.from("user_action_rights" as any).select("user_id, action_kind"),
        supabase.from("user_branch_access" as any).select("user_id, branch_id"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
        modules: new Set(((perms as any) ?? []).filter((x: any) => x.user_id === p.id && x.can_view).map((x: any) => x.module as ModuleKey)),
        approvals: new Set(((rights as any) ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.approval_kind as ApprovalKind)),
        actions: new Set(((acts as any) ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.action_kind as ActionKind)),
        branches: new Set(((brs as any) ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.branch_id as string)),
      }));
    },
  });

  if (loading) return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users-with-roles"] });

  const create = async () => {
    if (!form.email || !form.password) { toast.error("Email and password required"); return; }
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSubmitting(true);
    try {
      await createFn({ data: form });
      toast.success("User created. Share the temporary password with them — they'll be asked to change it on first sign-in.");
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", role: "staff" });
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const setRole = async (userId: string, role: AppRole, currentRoles: AppRole[]) => {
    const op = currentRoles.includes(role)
      ? supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
      : supabase.from("user_roles").insert({ user_id: userId, role });
    const { error } = await op;
    if (error) return toast.error(error.message);
    invalidate();
  };

  const toggleModule = async (userId: string, module: ModuleKey, on: boolean) => {
    if (on) {
      const { error } = await supabase.from("user_permissions" as any).delete().eq("user_id", userId).eq("module", module);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_permissions" as any).insert({ user_id: userId, module, can_view: true });
      if (error) return toast.error(error.message);
    }
    invalidate();
  };
  const toggleAction = async (userId: string, kind: ActionKind, on: boolean) => {
    if (on) {
      const { error } = await supabase.from("user_action_rights" as any).delete().eq("user_id", userId).eq("action_kind", kind);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_action_rights" as any).insert({ user_id: userId, action_kind: kind });
      if (error) return toast.error(error.message);
    }
    invalidate();
  };

  const toggleBranch = async (userId: string, branchId: string, on: boolean) => {
    if (on) {
      const { error } = await supabase.from("user_branch_access" as any).delete().eq("user_id", userId).eq("branch_id", branchId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_branch_access" as any).insert({ user_id: userId, branch_id: branchId });
      if (error) return toast.error(error.message);
    }
    invalidate();
  };

  const toggleApproval = async (userId: string, kind: ApprovalKind, on: boolean) => {
    if (on) {
      const { error } = await supabase.from("user_approval_rights" as any).delete().eq("user_id", userId).eq("approval_kind", kind);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_approval_rights" as any).insert({ user_id: userId, approval_kind: kind });
      if (error) return toast.error(error.message);
    }
    invalidate();
  };

  const onToggleActive = async (userId: string, makeActive: boolean) => {
    try { await activeFn({ data: { user_id: userId, active: makeActive } }); toast.success(makeActive ? "User reactivated" : "User deactivated"); invalidate(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const onDelete = async (userId: string) => {
    try { await deleteFn({ data: { user_id: userId } }); toast.success("User deleted"); invalidate(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & responsibilities</h1>
          <p className="text-sm text-muted-foreground">Create accounts, assign roles, modules and approval rights.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><UserPlus className="mr-2 h-4 w-4" /> New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create user account</DialogTitle>
              <DialogDescription>The user will sign in with this temporary password and be required to change it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
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
              <UserRow
                key={u.id}
                u={u}
                self={u.id === me?.id}
                onRole={setRole}
                onModule={toggleModule}
                onApproval={toggleApproval}
                onActive={onToggleActive}
                onDelete={onDelete}
                onReset={async (uid: string, pwd: string) => {
                  try { await resetFn({ data: { user_id: uid, new_password: pwd } }); toast.success("Password reset. Share it with the user."); }
                  catch (e: any) { toast.error(e?.message ?? "Failed"); }
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function UserRow({ u, self, onRole, onModule, onApproval, onActive, onDelete, onReset }: any) {
  const [resetOpen, setResetOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [permsOpen, setPermsOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{u.full_name || u.email}</p>
            {!u.is_active && <Badge variant="destructive">Inactive</Badge>}
            {self && <Badge variant="secondary">You</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">{u.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ROLES.map((r) => {
            const on = u.roles.includes(r);
            return (
              <button
                key={r}
                onClick={() => onRole(u.id, r, u.roles)}
                disabled={self && r === "admin" && on}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"} disabled:opacity-50`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={() => setPermsOpen((s) => !s)}>
          <Settings2 className="mr-2 h-4 w-4" /> {permsOpen ? "Hide" : "Permissions"}
        </Button>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><KeyRound className="mr-2 h-4 w-4" /> Reset password</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset password for {u.email}</DialogTitle>
              <DialogDescription>Set a temporary password. The user will be asked to change it on next sign-in.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>New temporary password</Label>
              <Input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
              <Button onClick={async () => { if (newPwd.length < 6) return toast.error("At least 6 characters"); await onReset(u.id, newPwd); setNewPwd(""); setResetOpen(false); }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2 text-sm">
          <Switch checked={u.is_active !== false} disabled={self} onCheckedChange={(v) => onActive(u.id, v)} />
          <span className="text-muted-foreground">{u.is_active !== false ? "Active" : "Inactive"}</span>
        </div>

        {!self && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="ml-auto"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes <strong>{u.email}</strong>. Their roles and permissions are revoked. Records they created remain.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(u.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {permsOpen && (
        <div className="mt-3 grid gap-4 border-t pt-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modules they can view</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_MODULES.map((m) => {
                const on = u.modules.has(m);
                return (
                  <label key={m} className="flex items-center gap-2 text-sm capitalize">
                    <Checkbox checked={on} onCheckedChange={() => onModule(u.id, m, on)} />
                    {m}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Admins automatically see every module.</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval rights</p>
            <div className="grid grid-cols-1 gap-2">
              {ALL_APPROVAL_KINDS.map((k) => {
                const on = u.approvals.has(k);
                return (
                  <label key={k} className="flex items-center gap-2 text-sm capitalize">
                    <Checkbox checked={on} onCheckedChange={() => onApproval(u.id, k, on)} />
                    {k.replace(/_/g, " ")}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Admins approve everything by default.</p>
          </div>
        </div>
      )}
    </div>
  );
}
