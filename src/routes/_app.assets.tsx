import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
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
import { Plus, Pencil, Search, Package, ScanLine, Archive, AlertCircle, FilterX, Trash2, Download, Upload, Send, Eye, ArrowRightLeft, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ScannerDialog } from "@/components/scanner-dialog";
import { AssetDetailTabs } from "@/components/asset-detail-tabs";
import { formatUGX } from "@/lib/utils";
import { submitApproval } from "@/lib/approvals";
import { downloadTemplate, importAssetsFromFile } from "@/lib/bulk-import";

export const Route = createFileRoute("/_app/assets")({
  component: AssetsPage,
  validateSearch: (s: Record<string, unknown>) => ({ focus: typeof s.focus === "string" ? s.focus : undefined }),
});

type Status = "in_use" | "in_storage" | "under_repair" | "retired" | "missing" | "disposed";
const STATUS_LABEL: Record<Status, string> = {
  in_use: "In use", in_storage: "In storage", under_repair: "Under repair",
  retired: "Retired", missing: "Missing", disposed: "Disposed",
};
const STATUS_TONE: Record<Status, string> = {
  in_use: "bg-success/15 text-success",
  in_storage: "bg-secondary text-secondary-foreground",
  under_repair: "bg-warning/20 text-warning-foreground",
  retired: "bg-muted text-muted-foreground",
  missing: "bg-destructive/15 text-destructive",
  disposed: "bg-muted text-muted-foreground line-through",
};

interface AssetForm {
  id?: string;
  asset_tag: string;
  serial_number: string;
  name: string;
  description: string;
  category_id: string | null;
  location_id: string | null;
  branch_id: string | null;
  status: Status;
  purchase_value: string;
  purchase_date: string;
  // Inline custodian (only used on create)
  assigned_to_name: string;
  department: string;
}

const empty: AssetForm = {
  asset_tag: "", serial_number: "", name: "", description: "",
  category_id: null, location_id: null, branch_id: null, status: "in_storage",
  purchase_value: "", purchase_date: "",
  assigned_to_name: "", department: "",
};

function AssetsPage() {
  const { canWrite, isAdmin, user, canDo, canSeeBranch } = useAuth();
  const canAdd = canWrite || canDo("add_asset");
  const canEdit = canWrite || canDo("edit_asset");
  const canRequestRetire = canWrite || canDo("initiate_retirement");
  const canRequestDispose = canWrite || canDo("initiate_disposal");
  const canRequestMove = canWrite || canDo("initiate_movement");
  const canRequestMaint = canWrite || canDo("initiate_maintenance");
  const qc = useQueryClient();
  const search = useSearch({ from: "/_app/assets" });
  const nav = useNavigate();

  const [q, setQ] = useState("");
  const [fBranch, setFBranch] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fDept, setFDept] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetForm>(empty);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"lookup" | "tag" | "serial">("lookup");
  const [dupOpen, setDupOpen] = useState(false);
  const [dupAsset, setDupAsset] = useState<any>(null);
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireAsset, setRetireAsset] = useState<any>(null);
  const [retireReason, setRetireReason] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewAsset, setViewAsset] = useState<any>(null);
  const [viewTab, setViewTab] = useState<string>("activity");
  const openView = (a: any, tab: string = "activity") => { setViewAsset(a); setViewTab(tab); setViewOpen(true); };


  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, categories(name), locations(name), branches(name,code)")
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
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    queryFn: async () => (await supabase.from("branches").select("id,name,code,is_active").eq("is_active", true).order("name")).data ?? [],
  });
  // Pull current assignments (latest per asset) for custodian/department display & filters
  const { data: assignments = [] } = useQuery({
    queryKey: ["asset-assignments-current"],
    queryFn: async () => (await supabase.from("asset_assignments")
      .select("asset_id, assigned_to_name, department, assignment_date")
      .order("assignment_date", { ascending: false })).data ?? [],
  });
  const currentBy: Record<string, any> = useMemo(() => {
    const m: Record<string, any> = {};
    assignments.forEach((a: any) => { if (!m[a.asset_id]) m[a.asset_id] = a; });
    return m;
  }, [assignments]);

  const visibleBranches = useMemo(
    () => (branches as any[]).filter((b) => canSeeBranch(b.id)),
    [branches, canSeeBranch],
  );

  const enriched = useMemo(() => (assets as any[])
    .filter((a) => canSeeBranch(a.branch_id))
    .map((a) => ({
      ...a,
      custodian: currentBy[a.id]?.assigned_to_name ?? "",
      department: currentBy[a.id]?.department ?? "",
    })), [assets, currentBy, canSeeBranch]);

  const filtered = enriched.filter((a) => {
    if (q) {
      const needle = q.toLowerCase();
      const hit = [a.name, a.asset_tag, a.serial_number, a.custodian, a.department]
        .some((v) => (v ?? "").toString().toLowerCase().includes(needle));
      if (!hit) return false;
    }
    if (fBranch && a.branch_id !== fBranch) return false;
    if (fCategory && a.category_id !== fCategory) return false;
    if (fLocation && a.location_id !== fLocation) return false;
    if (fStatus && a.status !== fStatus) return false;
    if (fDept && !(a.department ?? "").toLowerCase().includes(fDept.toLowerCase())) return false;
    return true;
  });

  const clearFilters = () => { setQ(""); setFBranch(""); setFCategory(""); setFLocation(""); setFStatus(""); setFDept(""); };

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (a: any) => {
    setForm({
      id: a.id, asset_tag: a.asset_tag, serial_number: a.serial_number ?? "",
      name: a.name, description: a.description ?? "",
      category_id: a.category_id, location_id: a.location_id, branch_id: a.branch_id,
      status: a.status,
      purchase_value: a.purchase_value?.toString() ?? "",
      purchase_date: a.purchase_date ?? "",
      assigned_to_name: "", department: "",
    });
    setOpen(true);
  };

  // Auto-open the asset from ?focus= query
  useEffect(() => {
    if (!search.focus || assets.length === 0) return;
    const a = (assets as any[]).find((x) => x.id === search.focus);
    if (a) {
      openEdit(a);
      nav({ to: "/assets", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.focus, assets]);

  const handleScan = (text: string) => {
    const code = text.trim();
    if (!code) return;
    if (scanMode === "tag" || scanMode === "serial") {
      const existing = (assets as any[]).find((a) =>
        (a.asset_tag.toLowerCase() === code.toLowerCase() ||
         (a.serial_number ?? "").toLowerCase() === code.toLowerCase()) &&
        a.id !== form.id
      );
      if (existing) { setDupAsset(existing); setDupOpen(true); return; }
      if (scanMode === "tag") setForm((f) => ({ ...f, asset_tag: code }));
      else setForm((f) => ({ ...f, serial_number: code }));
      toast.success(`${scanMode === "tag" ? "Tag" : "Serial"} scanned: ${code}`);
      return;
    }
    const found = (assets as any[]).find((a) =>
      a.asset_tag.toLowerCase() === code.toLowerCase() ||
      (a.serial_number ?? "").toLowerCase() === code.toLowerCase()
    );
    if (found) {
      openEdit(found);
      toast.success(`Asset found: ${found.name}`);
    } else if (canAdd) {
      setForm({ ...empty, asset_tag: code });
      setOpen(true);
      toast.message("New tag detected", { description: "Fill in details to register this asset." });
    } else {
      toast.error(`No asset matches "${code}"`);
    }
  };

  const save = async () => {
    if (!form.asset_tag.trim() || !form.name.trim()) { toast.error("Tag and name are required"); return; }
    if (!form.branch_id) { toast.error("Branch is required"); return; }

    const tagLower = form.asset_tag.trim().toLowerCase();
    const serialLower = form.serial_number.trim().toLowerCase();
    const dup = (assets as any[]).find((a) =>
      a.id !== form.id && (
        a.asset_tag.toLowerCase() === tagLower ||
        (serialLower && (a.serial_number ?? "").toLowerCase() === serialLower)
      )
    );
    if (dup) { setDupAsset(dup); setDupOpen(true); return; }

    const payload = {
      asset_tag: form.asset_tag.trim(),
      serial_number: form.serial_number.trim() || null,
      name: form.name.trim(),
      description: form.description || null,
      category_id: form.category_id,
      location_id: form.location_id,
      branch_id: form.branch_id,
      status: form.status,
      purchase_value: form.purchase_value ? Number(form.purchase_value) : null,
      purchase_date: form.purchase_date || null,
    };

    if (form.id) {
      const { error } = await supabase.from("assets").update(payload).eq("id", form.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Asset updated");
    } else {
      const { data: created, error } = await supabase
        .from("assets").insert({ ...payload, created_by: user?.id ?? null }).select().single();
      if (error || !created) { toast.error(error?.message ?? "Failed"); return; }
      // Create the initial custody record inline if provided
      if (form.assigned_to_name.trim() || form.department.trim()) {
        await supabase.from("asset_assignments").insert({
          asset_id: created.id,
          assigned_to_name: form.assigned_to_name.trim() || null,
          department: form.department.trim() || null,
          branch_id: form.branch_id,
          assignment_date: new Date().toISOString().slice(0, 10),
          created_by: user?.id ?? null,
        });
      }
      toast.success("Asset created");
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["asset-assignments-current"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const [reqKind, setReqKind] = useState<"retirement" | "disposal" | null>(null);
  const requestRetire = (a: any, kind: "retirement" | "disposal" = "retirement") => { setRetireAsset(a); setRetireReason(""); setReqKind(kind); setRetireOpen(true); };
  const submitRetire = async () => {
    if (!retireReason.trim()) { toast.error("Reason is required"); return; }
    try {
      await submitApproval({ kind: reqKind ?? "retirement", assetId: retireAsset.id, reason: retireReason.trim() });
      setRetireOpen(false);
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const removeAsset = async (a: any) => {
    if (!confirm(`Permanently delete asset "${a.name}" (${a.asset_tag})? This also removes its history.`)) return;
    const { error } = await supabase.from("assets").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Asset deleted");
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const [importing, setImporting] = useState(false);
  const onImport = async (f: File) => {
    setImporting(true);
    try {
      const r = await importAssetsFromFile(f, user?.id ?? null);
      toast.success(`Imported ${r.success} of ${r.total} rows`, { description: r.errors.length ? `${r.errors.length} rows had errors — check the asset_imports record.` : undefined });
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (e: any) { toast.error(e?.message ?? "Import failed"); }
    finally { setImporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">Manage your organization's fixed assets. Assets are retired (with admin approval), never deleted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setScanMode("lookup"); setScanOpen(true); }}>
            <ScanLine className="mr-2 h-4 w-4" /> Scan
          </Button>
          <Button variant="outline" onClick={downloadTemplate} title="Download Excel import template">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          {canAdd && (
            <label className="inline-flex">
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
              <Button variant="outline" disabled={importing} type="button" asChild>
                <span><Upload className="mr-2 h-4 w-4" /> {importing ? "Importing…" : "Import"}</span>
              </Button>
            </label>
          )}
          {canAdd && (
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
                    <Button type="button" size="icon" variant="outline" title="Scan tag (QR or barcode)" onClick={() => { setScanMode("tag"); setScanOpen(true); }}>
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="serial">Serial number</Label>
                  <div className="flex gap-2">
                    <Input id="serial" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="SN-XXXXXXXX" />
                    <Button type="button" size="icon" variant="outline" title="Scan serial (QR or barcode)" onClick={() => { setScanMode("serial"); setScanOpen(true); }}>
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea id="desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Branch *</Label>
                  <Select value={form.branch_id ?? ""} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {visibleBranches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k} disabled={(k === "retired" || k === "disposed") && !isAdmin}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && <p className="text-[11px] text-muted-foreground">Retire / dispose require admin approval via the asset's Disposal tab.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="val">Purchase value (UGX)</Label>
                  <Input id="val" type="number" step="1" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="date">Purchase date</Label>
                  <Input id="date" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
                </div>

                {/* Inline custodian on create */}
                {!form.id && (
                  <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
                    <p className="mb-2 text-sm font-medium">Assign custodian (optional)</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="custodian">Custodian (full name)</Label>
                        <Input id="custodian" value={form.assigned_to_name} onChange={(e) => setForm({ ...form, assigned_to_name: e.target.value })} placeholder="Jane Doe" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dept">Department</Label>
                        <Input id="dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Finance" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Creates an initial custody record assigned to this person & department.</p>
                  </div>
                )}
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
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="relative md:col-span-3 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, tag, serial, custodian…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fBranch || "all"} onValueChange={(v) => setFBranch(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {visibleBranches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCategory || "all"} onValueChange={(v) => setFCategory(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fLocation || "all"} onValueChange={(v) => setFLocation(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus || "all"} onValueChange={(v) => setFStatus(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 md:col-span-3 lg:col-span-2">
            <Input placeholder="Department…" value={fDept} onChange={(e) => setFDept(e.target.value)} />
            <Button variant="outline" size="icon" onClick={clearFilters} title="Clear filters"><FilterX className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No assets match the filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Tag</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Branch</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Category</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Location</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Custodian</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Value</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => openView(a, "activity")}>
                    <td className="px-3 py-3 font-mono text-xs">{a.asset_tag}</td>
                    <td className="px-3 py-3 font-medium">{a.name}{a.serial_number && <span className="ml-2 font-mono text-[10px] text-muted-foreground">SN: {a.serial_number}</span>}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{a.branches?.name ?? "—"}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">{a.categories?.name ?? "—"}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">{a.locations?.name ?? "—"}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {a.custodian || "—"}{a.department && <span className="block text-[11px]">{a.department}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status as Status]}`}>
                        {STATUS_LABEL[a.status as Status]}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatUGX(a.purchase_value)}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="View details & history" onClick={() => openView(a, "activity")}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        {a.status !== "retired" && a.status !== "disposed" && (
                          <>
                            {canRequestMove && (
                              <Button size="icon" variant="ghost" title="Request movement" onClick={() => openView(a, "movements")}>
                                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canRequestMaint && (
                              <Button size="icon" variant="ghost" title="Request maintenance" onClick={() => openView(a, "maintenance")}>
                                <Wrench className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canRequestRetire && (
                              <Button size="icon" variant="ghost" title="Request retirement" onClick={() => requestRetire(a, "retirement")}>
                                <Archive className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canRequestDispose && (
                              <Button size="icon" variant="ghost" title="Request disposal" onClick={() => requestRetire(a, "disposal")}>
                                <Send className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </>
                        )}
                        {isAdmin && (
                          <Button size="icon" variant="ghost" title="Delete asset (admin)" onClick={() => removeAsset(a)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>


      <ScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScan} />

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewAsset?.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{viewAsset?.asset_tag}</span></DialogTitle>
            <DialogDescription>
              Full history & audit trail{viewAsset?.status ? ` · Status: ${STATUS_LABEL[viewAsset.status as Status]}` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewAsset && <AssetDetailTabs assetId={viewAsset.id} defaultTab={viewTab} />}
        </DialogContent>
      </Dialog>


      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-warning" /> Already registered</DialogTitle>
            <DialogDescription>
              This tag or serial number is already in the system. Open the existing asset instead of creating a duplicate.
            </DialogDescription>
          </DialogHeader>
          {dupAsset && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{dupAsset.name}</p>
              <p className="text-xs text-muted-foreground">Tag: <span className="font-mono">{dupAsset.asset_tag}</span></p>
              {dupAsset.serial_number && <p className="text-xs text-muted-foreground">Serial: <span className="font-mono">{dupAsset.serial_number}</span></p>}
              <p className="text-xs text-muted-foreground">Status: {STATUS_LABEL[dupAsset.status as Status]}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupOpen(false)}>Cancel</Button>
            <Button onClick={() => { setDupOpen(false); openEdit(dupAsset); }}>Open existing asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request {reqKind ?? "retirement"}</DialogTitle>
            <DialogDescription>
              {retireAsset && <>Asset <strong>{retireAsset.name}</strong> ({retireAsset.asset_tag}). An admin must approve before action is taken.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason *</Label>
            <Textarea rows={3} value={retireReason} onChange={(e) => setRetireReason(e.target.value)} placeholder="End of useful life / damaged beyond repair / lost…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireOpen(false)}>Cancel</Button>
            <Button onClick={submitRetire}>Submit for approval</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
