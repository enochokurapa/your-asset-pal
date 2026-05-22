import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/locations")({
  component: LocationsPage,
});

type Loc = { id: string; name: string; address: string | null; parent_id: string | null; is_active: boolean };

function LocationsPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; address: string; parent_id: string; is_active: boolean }>({ name: "", address: "", parent_id: "", is_active: true });

  const { data = [], isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await supabase.from("locations").select("*").order("name")).data ?? [],
  });

  const { parents, childrenByParent } = useMemo(() => {
    const all = data as Loc[];
    const parents = all.filter((l) => !l.parent_id);
    const childrenByParent: Record<string, Loc[]> = {};
    all.forEach((l) => {
      if (l.parent_id) (childrenByParent[l.parent_id] ||= []).push(l);
    });
    return { parents, childrenByParent };
  }, [data]);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.id && form.parent_id === form.id) { toast.error("A location can't be its own parent"); return; }
    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
    };
    const { error } = form.id
      ? await supabase.from("locations").update(payload).eq("id", form.id)
      : await supabase.from("locations").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Updated" : "Created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["locations-list"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this location? Sub-locations will become top-level.")) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["locations"] });
  };
  const toggleActive = async (l: Loc) => {
    const { error } = await supabase.from("locations").update({ is_active: !l.is_active }).eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    toast.success(!l.is_active ? "Activated" : "Deactivated");
    qc.invalidateQueries({ queryKey: ["locations"] });
  };

  const openNew = () => { setForm({ name: "", address: "", parent_id: "", is_active: true }); setOpen(true); };
  const openEdit = (l: Loc) => { setForm({ id: l.id, name: l.name, address: l.address ?? "", parent_id: l.parent_id ?? "", is_active: l.is_active }); setOpen(true); };

  const renderCard = (l: Loc, isChild = false) => (
    <div key={l.id} className={`rounded-xl border bg-card p-4 ${isChild ? "ml-4 border-dashed" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{l.name}</p>
            {!l.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
          </div>
          {l.address && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{l.address}</p>}
        </div>
        {canWrite && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => remove(l.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      </div>
      {canWrite && (
        <div className="mt-3 flex items-center gap-2 border-t pt-2 text-xs">
          <Switch checked={l.is_active} onCheckedChange={() => toggleActive(l)} />
          <span className="text-muted-foreground">{l.is_active ? "Active" : "Inactive"}</span>
        </div>
      )}
    </div>
  );

  // Parent options exclude the current location and its descendants to avoid cycles
  const parentOptions = useMemo(() => {
    if (!form.id) return data as Loc[];
    const blocked = new Set<string>([form.id]);
    let added = true;
    while (added) {
      added = false;
      (data as Loc[]).forEach((l) => {
        if (l.parent_id && blocked.has(l.parent_id) && !blocked.has(l.id)) {
          blocked.add(l.id); added = true;
        }
      });
    }
    return (data as Loc[]).filter((l) => !blocked.has(l.id));
  }, [data, form.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
          <p className="text-sm text-muted-foreground">Where assets live. Use sub-locations for rooms inside a building.</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New location</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} location</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Parent location</Label>
                  <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="— Top level —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Top level —</SelectItem>
                      {parentOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Address</Label><Textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  Active
                </label>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-4">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <div className="py-12 text-center">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No locations yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {parents.map((p) => (
              <div key={p.id} className="space-y-2">
                {renderCard(p)}
                {(childrenByParent[p.id] ?? []).map((c) => renderCard(c, true))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
