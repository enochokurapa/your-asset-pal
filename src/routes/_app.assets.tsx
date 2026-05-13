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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Package, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { ScannerDialog } from "@/components/scanner-dialog";
import { AssetDetailTabs } from "@/components/asset-detail-tabs";

export const Route = createFileRoute("/_app/assets")({
  component: AssetsPage,
});

type Status = "in_use" | "in_storage" | "under_repair" | "retired" | "lost" | "disposed";
const STATUS_LABEL: Record<Status, string> = {
  in_use: "In use", in_storage: "In storage", under_repair: "Under repair",
  retired: "Retired", lost: "Lost", disposed: "Disposed",
};
const STATUS_TONE: Record<Status, string> = {
  in_use: "bg-success/15 text-success",
  in_storage: "bg-secondary text-secondary-foreground",
  under_repair: "bg-warning/20 text-warning-foreground",
  retired: "bg-muted text-muted-foreground",
  lost: "bg-destructive/15 text-destructive",
  disposed: "bg-muted text-muted-foreground line-through",
};

interface AssetForm {
  id?: string;
  asset_tag: string;
  name: string;
  description: string;
  category_id: string | null;
  location_id: string | null;
  status: Status;
  purchase_value: string;
  purchase_date: string;
}

const empty: AssetForm = {
  asset_tag: "", name: "", description: "",
  category_id: null, location_id: null, status: "in_storage",
  purchase_value: "", purchase_date: "",
};

function AssetsPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetForm>(empty);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"lookup" | "field">("lookup");

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, categories(name), locations(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations-list"],
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });

  const filtered = assets.filter((a: any) =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_tag.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (a: any) => {
    setForm({
      id: a.id, asset_tag: a.asset_tag, name: a.name, description: a.description ?? "",
      category_id: a.category_id, location_id: a.location_id, status: a.status,
      purchase_value: a.purchase_value?.toString() ?? "",
      purchase_date: a.purchase_date ?? "",
    });
    setOpen(true);
  };

  const handleScan = (text: string) => {
    const tag = text.trim();
    if (!tag) return;
    if (scanMode === "field") {
      setForm((f) => ({ ...f, asset_tag: tag }));
      toast.success(`Tag scanned: ${tag}`);
      return;
    }
    // lookup mode
    const found = assets.find((a: any) => a.asset_tag.toLowerCase() === tag.toLowerCase());
    if (found) {
      openEdit(found);
      toast.success(`Asset found: ${found.name}`);
    } else if (canWrite) {
      setForm({ ...empty, asset_tag: tag });
      setOpen(true);
      toast.message("New tag detected", { description: "Fill in details to create this asset." });
    } else {
      toast.error(`No asset matches tag "${tag}"`);
    }
  };

  const save = async () => {
    if (!form.asset_tag.trim() || !form.name.trim()) { toast.error("Tag and name are required"); return; }
    const payload = {
      asset_tag: form.asset_tag.trim(),
      name: form.name.trim(),
      description: form.description || null,
      category_id: form.category_id,
      location_id: form.location_id,
      status: form.status,
      purchase_value: form.purchase_value ? Number(form.purchase_value) : null,
      purchase_date: form.purchase_date || null,
    };
    const { error } = form.id
      ? await supabase.from("assets").update(payload).eq("id", form.id)
      : await supabase.from("assets").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Asset updated" : "Asset created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this asset?")) return;
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Asset deleted");
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">Manage your organization's fixed assets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setScanMode("lookup"); setScanOpen(true); }}>
            <ScanLine className="mr-2 h-4 w-4" /> Scan
          </Button>
          {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New asset</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit asset" : "New asset"}</DialogTitle>
                <DialogDescription>Fill in the details below.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="tag">Asset tag *</Label>
                  <div className="flex gap-2">
                    <Input id="tag" value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} placeholder="LAP-001" />
                    <Button type="button" size="icon" variant="outline" onClick={() => { setScanMode("field"); setScanOpen(true); }}>
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea id="desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={form.location_id ?? "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="val">Purchase value</Label>
                  <Input id="val" type="number" step="0.01" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="date">Purchase date</Label>
                  <Input id="date" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save}>{form.id ? "Save changes" : "Create asset"}</Button>
              </DialogFooter>
              {form.id && (
                <div className="border-t pt-4">
                  <AssetDetailTabs assetId={form.id} />
                </div>
              )}
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or tag…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="mt-4 overflow-x-auto">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No assets found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Tag</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Category</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Location</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Value</th>
                  {canWrite && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-3 font-mono text-xs">{a.asset_tag}</td>
                    <td className="px-3 py-3 font-medium">{a.name}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{a.categories?.name ?? "—"}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{a.locations?.name ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status as Status]}`}>
                        {STATUS_LABEL[a.status as Status]}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">
                      {a.purchase_value ? `$${Number(a.purchase_value).toLocaleString()}` : "—"}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <ScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScan} />
    </div>
  );
}
