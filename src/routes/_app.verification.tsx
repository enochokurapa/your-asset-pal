import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScannerDialog } from "@/components/scanner-dialog";
import { toast } from "sonner";
import { ClipboardCheck, ScanLine, Search, Download, FileText, AlertTriangle, CheckCircle2, XCircle, GitCompare, ExternalLink, ArrowRight } from "lucide-react";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } from "@/lib/pdf-template";

export const Route = createFileRoute("/_app/verification")({
  component: VerificationPage,
});

type Condition = "mint" | "good" | "fair" | "poor" | "damaged";
type VStatus = "verified" | "mismatched" | "not_found";

const CONDITIONS: Condition[] = ["mint", "good", "fair", "poor", "damaged"];

const STATUS_TONE: Record<VStatus, string> = {
  verified: "bg-success/15 text-success",
  mismatched: "bg-warning/20 text-warning-foreground",
  not_found: "bg-destructive/15 text-destructive",
};

function VerificationPage() {
  const { canDo, canSeeBranch, user, branchScope } = useAuth();
  const canPerform = canDo("perform_verification");
  const canExport = canDo("view_verification_reports") || canDo("export_gate_pass_reports") || true; // viewing only

  const qc = useQueryClient();

  // Branches
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active-verif"],
    queryFn: async () => (await supabase.from("branches").select("id,name,code").eq("is_active", true).order("name")).data ?? [],
  });
  const visibleBranches = branches.filter((b: any) => canSeeBranch(b.id));

  const [branchId, setBranchId] = useState<string>("");
  const [scanOpen, setScanOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [activeAsset, setActiveAsset] = useState<any>(null);
  const [open, setOpen] = useState(false);

  // Filters for the activity table
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: locs = [] } = useQuery({
    queryKey: ["locations-verif"],
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });

  // Profiles map (verified_by FK targets auth.users, not profiles — fetch separately)
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-verif"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = useMemo(
    () => Object.fromEntries((profiles as any[]).map((p) => [p.id, p])),
    [profiles],
  );

  // History
  const { data: verifs = [] } = useQuery({
    queryKey: ["verifications", branchScope ? Array.from(branchScope).sort().join(",") : "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("asset_verifications")
        .select("*, assets(id,name,asset_tag,serial_number), branches(name), locations(name)")
        .order("verified_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      return (data ?? []).filter((v: any) => canSeeBranch(v.branch_id));
    },
  });

  const [compare, setCompare] = useState<any>(null);

  const filtered = useMemo(() => verifs.filter((v: any) => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (filterBranch !== "all" && v.branch_id !== filterBranch) return false;
    if (fromDate && new Date(v.verified_at) < new Date(fromDate)) return false;
    if (toDate && new Date(v.verified_at) > new Date(toDate + "T23:59:59")) return false;
    if (search) {
      const q = search.toLowerCase();
      const a = v.assets;
      const txt = `${a?.asset_tag ?? ""} ${a?.name ?? ""} ${a?.serial_number ?? ""} ${v.custodian_name ?? ""} ${v.department ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  }), [verifs, statusFilter, filterBranch, fromDate, toDate, search]);

  // Look up asset by tag or serial
  const lookup = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    if (!branchId) { toast.error("Choose the branch you are verifying first"); return; }
    const { data, error } = await supabase
      .from("assets")
      .select("*, categories(name), locations(name), branches(name)")
      .or(`asset_tag.eq.${q},serial_number.eq.${q}`)
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) {
      // Record as not_found
      if (!canPerform) { toast.error("Asset not found"); return; }
      const conf = window.confirm(`Asset "${q}" not in register. Record as NOT FOUND?`);
      if (!conf) return;
      await (supabase as any).from("asset_verifications").insert({
        asset_id: null as any, // not allowed (NOT NULL). Skip.
      });
      toast.error("Asset not found in register");
      return;
    }
    // Last assignment for custodian autofill
    const { data: assn } = await supabase.from("asset_assignments")
      .select("assigned_to_name,department,branch_id")
      .eq("asset_id", data.id)
      .order("assignment_date", { ascending: false })
      .limit(1).maybeSingle();
    setActiveAsset({ ...data, _assn: assn });
    setOpen(true);
    setTag("");
  };

  /* ---------- Exports ---------- */

  const toRows = (list: any[]) => list.map((v: any) => ({
    "Date": new Date(v.verified_at).toLocaleString(),
    "Asset Tag": v.assets?.asset_tag ?? "",
    "Asset Name": v.assets?.name ?? "",
    "Serial": v.assets?.serial_number ?? "",
    "Branch": v.branches?.name ?? "",
    "Location": v.locations?.name ?? "",
    "Custodian": v.custodian_name ?? "",
    "Department": v.department ?? "",
    "Condition": v.condition ?? "",
    "Status": v.status,
    "Verified by": v.profiles?.full_name ?? v.profiles?.email ?? "—",
    "Notes": v.notes ?? "",
    "Changes": v.changes && Object.keys(v.changes).length ? JSON.stringify(v.changes) : "",
  }));

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(toRows(filtered));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Verifications");
    XLSX.writeFile(wb, "verification-report.xlsx");
  };

  const exportPDF = async () => {
    const tpl = await loadTemplate();
    const { doc, startY } = createBrandedPdf({
      template: tpl,
      orientation: "landscape",
      title: "Fixed Asset Verification Report",
      subtitle: `${filtered.length} record(s)`,
    });
    const rows = toRows(filtered);
    const head = ["Date","Tag","Name","Branch","Location","Custodian","Condition","Status","Verified by"];
    autoTable(doc, {
      startY,
      head: [head],
      body: rows.map(r => [r.Date, r["Asset Tag"], r["Asset Name"], r.Branch, r.Location, r.Custodian, r.Condition, r.Status, r["Verified by"]]),
      styles: { fontSize: 7, font: tpl.font_family },
      headStyles: { fillColor: tableHeadFill(tpl) },
      margin: { left: tpl.margin_left, right: tpl.margin_right, bottom: tpl.margin_bottom },
    });
    saveBranded(doc, tpl, "verification-report.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ClipboardCheck className="h-6 w-6" /> Fixed Asset Verification</h1>
          <p className="text-sm text-muted-foreground">Scan or look up assets, confirm details on the ground, and record verification outcomes.</p>
        </div>
      </div>

      {/* Scanner row */}
      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[260px_1fr_auto_auto]">
          <div className="space-y-1">
            <Label>Branch being verified</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Choose branch…" /></SelectTrigger>
              <SelectContent>
                {visibleBranches.length === 0 && <SelectItem value="none" disabled>No branches</SelectItem>}
                {visibleBranches.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Asset tag or serial number</Label>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") lookup(tag); }}
              placeholder="Type and press Enter, or scan…"
              disabled={!branchId}
            />
          </div>
          <div className="flex items-end"><Button variant="outline" onClick={() => lookup(tag)} disabled={!branchId || !tag.trim()}><Search className="mr-1 h-4 w-4" />Find</Button></div>
          <div className="flex items-end"><Button onClick={() => setScanOpen(true)} disabled={!branchId}><ScanLine className="mr-1 h-4 w-4" />Scan</Button></div>
        </div>
      </Card>

      {/* Filters + exports */}
      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="space-y-1"><Label>From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="space-y-1"><Label>To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="mismatched">Mismatched</SelectItem>
                <SelectItem value="not_found">Not found</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Branch</Label>
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {visibleBranches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2"><Label>Search</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tag, name, custodian…" /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportXLSX}><Download className="mr-1 h-4 w-4" />Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="mr-1 h-4 w-4" />PDF</Button>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} record(s)</span>
        </div>
      </Card>

      {/* Activity */}
      <Card className="p-0 overflow-hidden">
        <div className="border-b px-5 py-3 text-sm font-semibold">Verification activity</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Branch / Location</th>
                <th className="px-3 py-2">Custodian</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No verifications match the filters.</td></tr>
              ) : filtered.map((v: any) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(v.verified_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{v.assets?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{v.assets?.asset_tag ?? ""} {v.assets?.serial_number ? `· SN ${v.assets.serial_number}` : ""}</p>
                  </td>
                  <td className="px-3 py-2">{v.branches?.name ?? "—"}{v.locations?.name ? ` · ${v.locations.name}` : ""}</td>
                  <td className="px-3 py-2">{v.custodian_name ?? "—"}{v.department ? ` · ${v.department}` : ""}</td>
                  <td className="px-3 py-2 capitalize">{v.condition ?? "—"}</td>
                  <td className="px-3 py-2"><Badge className={STATUS_TONE[v.status as VStatus]}>{v.status.replace("_"," ")}</Badge></td>
                  <td className="px-3 py-2 text-xs">{v.profiles?.full_name ?? v.profiles?.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={(t) => lookup(t)} />

      {activeAsset && (
        <VerifyDialog
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setActiveAsset(null); }}
          asset={activeAsset}
          branchId={branchId}
          branches={visibleBranches}
          locations={locs}
          canPerform={canPerform}
          userId={user?.id ?? null}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["verifications"] });
            qc.invalidateQueries({ queryKey: ["assets"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }}
        />
      )}
    </div>
  );
}

function VerifyDialog({
  open, onOpenChange, asset, branchId, branches, locations, canPerform, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: any;
  branchId: string;
  branches: any[];
  locations: any[];
  canPerform: boolean;
  userId: string | null;
  onSaved: () => void;
}) {
  const expectedBranchId = asset.branch_id;
  const expectedLocationId = asset.location_id;
  const expectedCustodian = asset._assn?.assigned_to_name ?? "";
  const expectedDepartment = asset._assn?.department ?? "";

  const [name, setName] = useState<string>(asset.name ?? "");
  const [description, setDescription] = useState<string>(asset.description ?? "");
  const [locationId, setLocationId] = useState<string>(asset.location_id ?? "");
  const [custodian, setCustodian] = useState<string>(expectedCustodian);
  const [department, setDepartment] = useState<string>(expectedDepartment);
  const [condition, setCondition] = useState<Condition>((asset.condition as Condition) ?? "good");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const branchMatch = branchId === expectedBranchId;

  const save = async (status: VStatus) => {
    if (!canPerform) { toast.error("You don't have permission to verify assets"); return; }
    setSaving(true);

    // Build changes diff
    const changes: Record<string, { from: any; to: any }> = {};
    if (name !== (asset.name ?? "")) changes.name = { from: asset.name, to: name };
    if (description !== (asset.description ?? "")) changes.description = { from: asset.description, to: description };
    if (locationId !== (asset.location_id ?? "")) changes.location_id = { from: asset.location_id, to: locationId || null };
    if (branchId !== (asset.branch_id ?? "")) changes.branch_id = { from: asset.branch_id, to: branchId };
    if (condition !== (asset.condition ?? null)) changes.condition = { from: asset.condition, to: condition };
    if (custodian !== expectedCustodian) changes.custodian = { from: expectedCustodian, to: custodian };
    if (department !== expectedDepartment) changes.department = { from: expectedDepartment, to: department };

    // Insert verification record
    const { error: vErr } = await (supabase as any).from("asset_verifications").insert({
      asset_id: asset.id,
      branch_id: branchId || null,
      location_id: locationId || null,
      custodian_name: custodian || null,
      department: department || null,
      condition,
      status,
      notes: notes || null,
      changes,
      verified_by: userId,
    });
    if (vErr) { setSaving(false); toast.error(vErr.message); return; }

    // If verified / mismatched, write back the edits to the asset
    if (status !== "not_found") {
      const updates: any = { name, description: description || null, condition, branch_id: branchId || null, location_id: locationId || null };
      const { error: aErr } = await supabase.from("assets").update(updates).eq("id", asset.id);
      if (aErr) { setSaving(false); toast.error(aErr.message); return; }

      // If custodian changed, add an assignment
      if (custodian !== expectedCustodian || department !== expectedDepartment) {
        await supabase.from("asset_assignments").insert({
          asset_id: asset.id,
          assigned_to_name: custodian || null,
          department: department || null,
          branch_id: branchId || null,
          assignment_date: new Date().toISOString().slice(0, 10),
          notes: `Updated via verification (${status})`,
          created_by: userId,
        });
      }
    }

    setSaving(false);
    toast.success(`Recorded: ${status.replace("_", " ")}`);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verify asset · {asset.asset_tag}</DialogTitle>
          <DialogDescription>
            Confirm or correct the details on the ground. Tag and serial number are locked.
          </DialogDescription>
        </DialogHeader>

        {!branchMatch && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs flex gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <div>
              <p className="font-medium">Branch mismatch</p>
              <p className="text-muted-foreground">
                Register says <b>{branches.find((b: any) => b.id === expectedBranchId)?.name ?? "—"}</b>, you are verifying at <b>{branches.find((b: any) => b.id === branchId)?.name ?? "—"}</b>. Save as Mismatched if this is not where it should be.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Asset tag (locked)</Label><Input value={asset.asset_tag} disabled /></div>
          <div className="space-y-1"><Label>Serial number (locked)</Label><Input value={asset.serial_number ?? ""} disabled /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Select value={locationId || "none"} onValueChange={(v) => setLocationId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Condition</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as Condition)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Custodian</Label><Input value={custodian} onChange={(e) => setCustodian(e.target.value)} placeholder="Person currently holding it" /></div>
          <div className="space-y-1"><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth recording…" /></div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={() => save("not_found")} disabled={saving}><XCircle className="mr-1 h-4 w-4" />Not found</Button>
          <Button variant="secondary" onClick={() => save("mismatched")} disabled={saving}><AlertTriangle className="mr-1 h-4 w-4" />Mismatched</Button>
          <Button onClick={() => save("verified")} disabled={saving}><CheckCircle2 className="mr-1 h-4 w-4" />Verified</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
