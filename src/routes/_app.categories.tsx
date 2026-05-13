import { useState } from "react";
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
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/categories")({
  component: CategoriesPage,
});

interface CatForm { id?: string; name: string; description: string; parent_id: string | null }
const empty: CatForm = { name: "", description: "", parent_id: null };

function CategoriesPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CatForm>(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("name")).data ?? [],
  });

  const parents = data.filter((c: any) => !c.parent_id);
  const childrenOf = (pid: string) => data.filter((c: any) => c.parent_id === pid);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.id && form.parent_id === form.id) { toast.error("A category can't be its own parent"); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      parent_id: form.parent_id,
    };
    const { error } = form.id
      ? await supabase.from("categories").update(payload).eq("id", form.id)
      : await supabase.from("categories").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Updated" : "Created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["categories-list"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["categories"] });
  };
  const openEdit = (c: any) => { setForm({ id: c.id, name: c.name, description: c.description ?? "", parent_id: c.parent_id }); setOpen(true); };
  const openNew = (parentId?: string) => { setForm({ ...empty, parent_id: parentId ?? null }); setOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">Group your assets — supports sub-categories.</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openNew()}><Plus className="mr-2 h-4 w-4" /> New category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} category</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Parent category</Label>
                  <Select value={form.parent_id ?? "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="— Top level —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Top level —</SelectItem>
                      {parents.filter((p: any) => p.id !== form.id).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
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
            <Tags className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No categories yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {parents.map((c: any) => (
              <div key={c.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openNew(c.id)}><Plus className="mr-1 h-3 w-3" />Sub</Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
                {childrenOf(c.id).length > 0 && (
                  <div className="mt-3 grid gap-2 border-l-2 border-muted pl-3 sm:grid-cols-2">
                    {childrenOf(c.id).map((sub: any) => (
                      <div key={sub.id} className="flex items-start justify-between gap-2 rounded-lg border bg-background p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sub.name}</p>
                          {sub.description && <p className="text-xs text-muted-foreground">{sub.description}</p>}
                        </div>
                        {canWrite && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(sub)}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => remove(sub.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
