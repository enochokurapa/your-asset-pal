import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

interface BranchForm {
  id?: string;
  name: string;
  code: string;
  address: string;
  is_active: boolean;
}
const empty: BranchForm = { name: "", code: "", address: "", is_active: true };

function BranchesPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BranchForm>(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("*").order("name")).data ?? [],
  });
  const { data: counts = {} } = useQuery({
    queryKey: ["branch-asset-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("branch_id");
      const map: Record<string, number> = {};
      (data ?? []).forEach((a: any) => {
        if (a.branch_id) map[a.branch_id] = (map[a.branch_id] ?? 0) + 1;
      });
      return map;
    },
  });

  if (!isAdmin) return <Navigate to="/dashboard" />;

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (b: any) => {
    setForm({ id: b.id, name: b.name, code: b.code ?? "", address: b.address ?? "", is_active: b.is_active });
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      address: form.address.trim() || null,
      is_active: form.is_active,
      created_by: user?.id ?? null,
    };
    const { error } = form.id
      ? await supabase.from("branches").update(payload).eq("id", form.id)
      : await supabase.from("branches").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Branch updated" : "Branch added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["branches"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branches</h1>
          <p className="text-sm text-muted-foreground">Company branches. Branches are never deleted — deactivate to retire.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New branch</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit branch" : "New branch"}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="HQ / KLA / MBR" /></div>
              <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{form.id ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> :
          data.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No branches yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((b: any) => (
                <div key={b.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{b.name}</h3>
                        {b.code && <Badge variant="outline" className="text-xs">{b.code}</Badge>}
                        {!b.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </div>
                      {b.address && <p className="mt-1 text-xs text-muted-foreground">{b.address}</p>}
                      <p className="mt-2 text-sm tabular-nums"><span className="font-semibold">{counts[b.id] ?? 0}</span> <span className="text-muted-foreground">assets</span></p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}
