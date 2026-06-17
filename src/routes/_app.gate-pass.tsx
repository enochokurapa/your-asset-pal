import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, FileDown, Eye, CheckCircle2, XCircle, DoorOpen, PackageCheck, FileSpreadsheet, Filter, X } from "lucide-react";
import autoTable from "jspdf-autotable";

import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/gate-pass")({
  component: GatePassPage,
});

type GP = any;

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  checked_out: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  returned: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
};

function GatePassPage() {
  const { user, isAdmin, isManager, roles, canDo, canSeeBranch } = useAuth();
  const qc = useQueryClient();
  const isSecurity = roles.includes("security");
  const canApprove = isAdmin || isManager || canDo("approve_gate_pass");
  const canVerify = isAdmin || isManager || isSecurity || canDo("verify_gate_pass");
  const canRequest = !!user;
  const canViewReports = isAdmin || isManager || canDo("view_gate_pass_reports");
  const canExportReports = isAdmin || isManager || canDo("export_gate_pass_reports");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailGP, setDetailGP] = useState<GP | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [previewOpen, setPreviewOpen] = useState<null | "pdf" | "xlsx">(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [requesterFilter, setRequesterFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("");
  const [dateField, setDateField] = useState<"created_at" | "expected_return_date" | "checked_out_at" | "returned_at">("created_at");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const resetFilters = () => {
    setStatusFilter("all"); setAssetFilter("all"); setRequesterFilter("all");
    setBranchFilter("all"); setDestinationFilter(""); setDateField("created_at");
    setDateFrom(""); setDateTo("");
  };

  // Data
  const passesQ = useQuery({
    queryKey: ["gate-passes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gate_passes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GP[];
    },
  });
  const assetsQ = useQuery({
    queryKey: ["gate-pass-assets"],
    queryFn: async () => {
      const { data } = await supabase.from("assets")
        .select("id,asset_tag,name,status,branch_id,assigned_to,branches(name)")
        .order("name");
      return data ?? [];
    },
  });
  const branchesQ = useQuery({
    queryKey: ["gate-pass-branches"],
    queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [],
  });
  const profilesQ = useQuery({
    queryKey: ["gate-pass-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
  });

  const branchName = (id?: string | null) =>
    (branchesQ.data ?? []).find((b: any) => b.id === id)?.name ?? "—";
  const userName = (id?: string | null) => {
    if (!id) return "—";
    const p = (profilesQ.data ?? []).find((x: any) => x.id === id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };
  const assetLabel = (id: string) => {
    const a = (assetsQ.data ?? []).find((x: any) => x.id === id);
    return a ? `${a.asset_tag} — ${a.name}` : id.slice(0, 8);
  };

  const visiblePasses = useMemo(() => {
    let list = (passesQ.data ?? []).filter((p: GP) => canSeeBranch(p.branch_id));
    if (statusFilter !== "all") list = list.filter((p: GP) => p.status === statusFilter);
    if (assetFilter !== "all") list = list.filter((p: GP) => p.asset_id === assetFilter);
    if (requesterFilter !== "all") list = list.filter((p: GP) => p.requested_by === requesterFilter);
    if (branchFilter !== "all") list = list.filter((p: GP) => p.branch_id === branchFilter);
    if (destinationFilter.trim()) {
      const q = destinationFilter.trim().toLowerCase();
      list = list.filter((p: GP) => (p.destination ?? "").toLowerCase().includes(q));
    }
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
      const to = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
      list = list.filter((p: GP) => {
        const v = p[dateField];
        if (!v) return false;
        const t = new Date(v).getTime();
        return t >= from && t <= to;
      });
    }
    return list;
  }, [passesQ.data, canSeeBranch, statusFilter, assetFilter, requesterFilter, branchFilter, destinationFilter, dateField, dateFrom, dateTo]);

  const requestableAssets = useMemo(() => {
    const list = (assetsQ.data ?? []) as any[];
    return list.filter((a) =>
      canSeeBranch(a.branch_id) &&
      !["disposed", "retired", "checked_out", "under_repair"].includes(a.status)
    );
  }, [assetsQ.data, canSeeBranch]);

  // Build report rows for export/preview
  const reportRows = useMemo(() => visiblePasses.map((p: GP) => ({
    "Pass No.": p.pass_number ?? "—",
    "Asset": assetLabel(p.asset_id),
    "Status": (p.status ?? "").replace(/_/g, " "),
    "Destination": p.destination ?? "",
    "Reason": p.reason ?? "",
    "Branch": branchName(p.branch_id),
    "Requested by": userName(p.requested_by),
    "Requested at": p.created_at ? new Date(p.created_at).toLocaleString() : "",
    "Expected return": p.expected_return_date ?? "",
    "Approved by": userName(p.approver_id),
    "Decided at": p.decided_at ? new Date(p.decided_at).toLocaleString() : "",
    "Checked out by": userName(p.checked_out_by),
    "Checked out at": p.checked_out_at ? new Date(p.checked_out_at).toLocaleString() : "",
    "Returned by": userName(p.returned_by),
    "Returned at": p.returned_at ? new Date(p.returned_at).toLocaleString() : "",
    "Return condition": p.return_condition ?? "",
  })), [visiblePasses, assetsQ.data, branchesQ.data, profilesQ.data]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter !== "all") parts.push(`Status: ${statusFilter}`);
    if (assetFilter !== "all") parts.push(`Asset: ${assetLabel(assetFilter)}`);
    if (requesterFilter !== "all") parts.push(`Requester: ${userName(requesterFilter)}`);
    if (branchFilter !== "all") parts.push(`Branch: ${branchName(branchFilter)}`);
    if (destinationFilter) parts.push(`Destination~"${destinationFilter}"`);
    if (dateFrom || dateTo) parts.push(`${dateField} ${dateFrom || "…"} → ${dateTo || "…"}`);
    return parts.join(" · ") || "All gate passes";
  }, [statusFilter, assetFilter, requesterFilter, branchFilter, destinationFilter, dateField, dateFrom, dateTo, assetsQ.data, branchesQ.data, profilesQ.data]);

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(reportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gate Passes");
    XLSX.writeFile(wb, `gate-pass-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportPDF = async () => {
    const { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } = await import("@/lib/pdf-template");
    const template = await loadTemplate();
    const { doc, startY } = createBrandedPdf({
      template,
      orientation: "landscape",
      title: "Gate Pass Report",
      subtitle: `${reportRows.length} record(s) · Filters: ${filterSummary}`,
    });
    const cols = ["Pass No.", "Asset", "Status", "Destination", "Branch", "Requested by", "Requested at", "Expected return", "Checked out at", "Returned at"];
    autoTable(doc, {
      startY,
      head: [cols],
      body: reportRows.map((r: any) => cols.map((c) => r[c] ?? "")),
      styles: { fontSize: 7, font: template.font_family },
      headStyles: { fillColor: tableHeadFill(template) },
      margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
    });
    saveBranded(doc, template, `gate-pass-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gate Pass Management</h1>
          <p className="text-sm text-muted-foreground">Request, approve and track asset movement outside the premises.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="checked_out">Checked out</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-4 w-4" /> {showFilters ? "Hide filters" : "More filters"}
          </Button>
          {canViewReports && (
            <>
              <Button variant="outline" onClick={() => setPreviewOpen("pdf")}><Eye className="h-4 w-4" /> Preview PDF</Button>
              <Button variant="outline" onClick={() => setPreviewOpen("xlsx")}><Eye className="h-4 w-4" /> Preview Excel</Button>
            </>
          )}
          {canExportReports && (
            <>
              <Button variant="outline" onClick={exportPDF}><FileDown className="h-4 w-4" /> PDF</Button>
              <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            </>
          )}
          {canRequest && (
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Request</Button>
          )}
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4 grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">Asset</Label>
              <Select value={assetFilter} onValueChange={setAssetFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assets</SelectItem>
                  {(assetsQ.data ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.asset_tag} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Requested by</Label>
              <Select value={requesterFilter} onValueChange={setRequesterFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Anyone</SelectItem>
                  {(profilesQ.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Branch</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branchesQ.data ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Destination contains</Label>
              <Input value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)} placeholder="e.g. Kampala" />
            </div>
            <div>
              <Label className="text-xs">Date field</Label>
              <Select value={dateField} onValueChange={(v) => setDateField(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Requested at</SelectItem>
                  <SelectItem value="expected_return_date">Expected return</SelectItem>
                  <SelectItem value="checked_out_at">Checked out at</SelectItem>
                  <SelectItem value="returned_at">Returned at</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-3 flex justify-between items-center">
              <p className="text-xs text-muted-foreground">{visiblePasses.length} record(s) · {filterSummary}</p>
              <Button variant="ghost" size="sm" onClick={resetFilters}><X className="h-4 w-4" /> Reset</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <SummaryCards passes={visiblePasses} />

      <Card>
        <CardHeader><CardTitle>Gate Passes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pass No.</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Expected return</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiblePasses.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No gate passes match your filters.</TableCell></TableRow>
              )}
              {visiblePasses.map((p: GP) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.pass_number ?? "—"}</TableCell>
                  <TableCell>{assetLabel(p.asset_id)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{p.destination}</TableCell>
                  <TableCell>{p.expected_return_date}</TableCell>
                  <TableCell>{branchName(p.branch_id)}</TableCell>
                  <TableCell>{userName(p.requested_by)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLOR[p.status] ?? ""} variant="outline">
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetailGP(p)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {createOpen && (
        <CreateDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          assets={requestableAssets}
          userId={user!.id}
          onCreated={() => { qc.invalidateQueries({ queryKey: ["gate-passes"] }); }}
        />
      )}

      {previewOpen && (
        <ReportPreviewDialog
          mode={previewOpen}
          rows={reportRows}
          summary={filterSummary}
          onClose={() => setPreviewOpen(null)}
          onDownload={previewOpen === "pdf" ? exportPDF : exportXLSX}
          canDownload={canExportReports}
        />
      )}

      {detailGP && (
        <DetailDialog
          gp={detailGP}
          onClose={() => setDetailGP(null)}
          canApprove={canApprove}
          canVerify={canVerify}
          isOwner={detailGP.requested_by === user?.id}
          assetLabel={assetLabel(detailGP.asset_id)}
          branchName={branchName(detailGP.branch_id)}
          requesterName={userName(detailGP.requested_by)}
          approverName={userName(detailGP.approver_id)}
          checkedOutName={userName(detailGP.checked_out_by)}
          returnedName={userName(detailGP.returned_by)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["gate-passes"] })}
        />
      )}
    </div>
  );
}

function ReportPreviewDialog({ mode, rows, summary, onClose, onDownload, canDownload }: {
  mode: "pdf" | "xlsx"; rows: any[]; summary: string; onClose: () => void; onDownload: () => void; canDownload: boolean;
}) {
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{mode === "pdf" ? "PDF Preview" : "Excel Preview"} — Gate Pass Report</DialogTitle>
          <DialogDescription>{rows.length} record(s) · {summary}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>{cols.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={cols.length || 1} className="text-center py-8 text-sm text-muted-foreground">No rows.</TableCell></TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>{cols.map((c) => <TableCell key={c} className="whitespace-nowrap text-xs">{r[c]}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canDownload && (
            <Button onClick={onDownload}>
              {mode === "pdf" ? <><FileDown className="h-4 w-4" /> Download PDF</> : <><FileSpreadsheet className="h-4 w-4" /> Download Excel</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCards({ passes }: { passes: GP[] }) {
  const counts = passes.reduce((acc: any, p: GP) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tiles = [
    { label: "Pending", value: counts.pending ?? 0 },
    { label: "Approved", value: counts.approved ?? 0 },
    { label: "Checked out", value: counts.checked_out ?? 0 },
    { label: "Returned", value: counts.returned ?? 0 },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-semibold">{t.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CreateDialog({ open, onClose, assets, userId, onCreated }: {
  open: boolean; onClose: () => void; assets: any[]; userId: string; onCreated: () => void;
}) {
  const [assetId, setAssetId] = useState("");
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [expected, setExpected] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!assetId || !reason || !destination || !expected) throw new Error("All required fields must be filled");
      const asset = assets.find((a) => a.id === assetId);
      let attachment_url: string | null = null;
      if (file) {
        const path = `gate-pass/${assetId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("asset-files").upload(path, file);
        if (upErr) throw upErr;
        attachment_url = path;
      }
      const { error } = await (supabase as any).from("gate_passes").insert({
        asset_id: assetId,
        branch_id: asset?.branch_id ?? null,
        requested_by: userId,
        reason, destination,
        expected_return_date: expected,
        attachment_url,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Gate pass request submitted"); onCreated(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Gate Pass Request</DialogTitle>
          <DialogDescription>Request permission to take an asset outside the premises.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Asset *</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger><SelectValue placeholder="Choose an asset" /></SelectTrigger>
              <SelectContent>
                {assets.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No assets available</div>}
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.asset_tag} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason for movement *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Destination *</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Client site, Acme Ltd, Kampala" />
          </div>
          <div>
            <Label>Expected return date *</Label>
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          <div>
            <Label>Supporting attachment (optional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Submit Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog(props: {
  gp: GP; onClose: () => void;
  canApprove: boolean; canVerify: boolean; isOwner: boolean;
  assetLabel: string; branchName: string; requesterName: string;
  approverName: string; checkedOutName: string; returnedName: string;
  onChanged: () => void;
}) {
  const { gp, onClose, canApprove, canVerify, isOwner, onChanged } = props;
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");

  const update = async (patch: any, msg: string, postAssetUpdate?: () => Promise<void>) => {
    const { error } = await (supabase as any).from("gate_passes").update(patch).eq("id", gp.id);
    if (error) { toast.error(error.message); return; }
    if (postAssetUpdate) await postAssetUpdate();
    toast.success(msg);
    onChanged();
    onClose();
  };

  const approve = () => {
    const { data: u } = { data: { user: { id: "" } } } as any;
    supabase.auth.getUser().then(({ data }) =>
      update(
        { status: "approved", approver_id: data.user?.id, decided_at: new Date().toISOString(), decision_reason: reason || null },
        "Gate pass approved",
      ),
    );
  };
  const reject = () => {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    supabase.auth.getUser().then(({ data }) =>
      update(
        { status: "rejected", approver_id: data.user?.id, decided_at: new Date().toISOString(), decision_reason: reason },
        "Gate pass rejected",
      ),
    );
  };
  const checkout = async () => {
    const { data: a } = await supabase.from("assets").select("status").eq("id", gp.asset_id).single();
    const { data: u } = await supabase.auth.getUser();
    await update(
      {
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: u.user?.id,
        previous_asset_status: a?.status ?? null,
      },
      "Asset checked out",
      async () => {
        await supabase.from("assets").update({ status: "checked_out" as any, previous_status: a?.status ?? null }).eq("id", gp.asset_id);
      },
    );
  };
  const returnAsset = async () => {
    const { data: u } = await supabase.auth.getUser();
    const restored = gp.previous_asset_status ?? "in_storage";
    await update(
      {
        status: "returned",
        returned_at: new Date().toISOString(),
        returned_by: u.user?.id,
        return_condition: condition,
        return_notes: notes || null,
      },
      "Asset returned",
      async () => {
        await supabase.from("assets").update({ status: restored, previous_status: null }).eq("id", gp.asset_id);
      },
    );
  };
  const cancel = () => {
    supabase.auth.getUser().then(() =>
      update({ status: "cancelled", decision_reason: reason || "Cancelled by requester" }, "Request cancelled"),
    );
  };

  const downloadPdf = async () => {
    const { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } = await import("@/lib/pdf-template");
    const template = await loadTemplate();
    const { doc, startY, pageWidth } = createBrandedPdf({
      template,
      title: "GATE PASS",
      subtitle: `Pass No: ${gp.pass_number ?? "(pending approval)"}`,
    });

    autoTable(doc, {
      startY,
      head: [["Field", "Value"]],
      body: [
        ["Asset", props.assetLabel],
        ["Branch", props.branchName],
        ["Destination", gp.destination],
        ["Reason", gp.reason],
        ["Expected return", gp.expected_return_date],
        ["Status", gp.status.replace(/_/g, " ")],
        ["Requested by", props.requesterName],
        ["Requested at", new Date(gp.created_at).toLocaleString()],
        ["Approved by", props.approverName],
        ["Decided at", gp.decided_at ? new Date(gp.decided_at).toLocaleString() : "—"],
        ["Decision reason", gp.decision_reason ?? "—"],
        ["Checked out by", props.checkedOutName],
        ["Checked out at", gp.checked_out_at ? new Date(gp.checked_out_at).toLocaleString() : "—"],
        ["Returned by", props.returnedName],
        ["Returned at", gp.returned_at ? new Date(gp.returned_at).toLocaleString() : "—"],
        ["Return condition", gp.return_condition ?? "—"],
        ["Return notes", gp.return_notes ?? "—"],
      ],
      styles: { fontSize: 9, font: template.font_family },
      headStyles: { fillColor: tableHeadFill(template) },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
      margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    const colW = (pageWidth - template.margin_left - template.margin_right) / 3;
    const x1 = template.margin_left;
    const x2 = template.margin_left + colW;
    const x3 = template.margin_left + colW * 2;
    doc.text("_________________________", x1, finalY);
    doc.text("Requester signature", x1, finalY + 6);
    doc.text("_________________________", x2, finalY);
    doc.text("Approver signature", x2, finalY + 6);
    doc.text("_________________________", x3, finalY);
    doc.text("Security signature", x3, finalY + 6);

    saveBranded(doc, template, `gate-pass-${gp.pass_number ?? gp.id.slice(0, 8)}.pdf`);
  };


  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Gate Pass
            <Badge className={STATUS_COLOR[gp.status]} variant="outline">{gp.status.replace(/_/g, " ")}</Badge>
            {gp.pass_number && <span className="font-mono text-sm text-muted-foreground">{gp.pass_number}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Asset" value={props.assetLabel} />
          <Row label="Branch" value={props.branchName} />
          <Row label="Destination" value={gp.destination} />
          <Row label="Expected return" value={gp.expected_return_date} />
          <Row label="Reason" value={gp.reason} full />
          <Row label="Requested by" value={`${props.requesterName} · ${new Date(gp.created_at).toLocaleString()}`} full />
          {gp.approver_id && <Row label="Decided by" value={`${props.approverName} · ${gp.decided_at ? new Date(gp.decided_at).toLocaleString() : ""}`} full />}
          {gp.decision_reason && <Row label="Decision reason" value={gp.decision_reason} full />}
          {gp.checked_out_at && <Row label="Checked out" value={`${props.checkedOutName} · ${new Date(gp.checked_out_at).toLocaleString()}`} full />}
          {gp.returned_at && <Row label="Returned" value={`${props.returnedName} · ${new Date(gp.returned_at).toLocaleString()}`} full />}
          {gp.return_condition && <Row label="Condition on return" value={`${gp.return_condition}${gp.return_notes ? " — " + gp.return_notes : ""}`} full />}
          {gp.attachment_url && (
            <Row label="Attachment" full value={
              <Button size="sm" variant="link" onClick={async () => {
                const { data } = await supabase.storage.from("asset-files").createSignedUrl(gp.attachment_url, 60);
                if (data) window.open(data.signedUrl, "_blank");
              }}>Open attachment</Button>
            } />
          )}
        </div>

        {/* Action panel */}
        <div className="space-y-3 border-t pt-3">
          {gp.status === "pending" && canApprove && (
            <div className="space-y-2">
              <Label>Approval note (required for rejection)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button onClick={approve}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
                <Button variant="destructive" onClick={reject}><XCircle className="h-4 w-4" /> Reject</Button>
              </div>
            </div>
          )}
          {gp.status === "pending" && isOwner && (
            <Button variant="outline" onClick={cancel}>Cancel my request</Button>
          )}
          {gp.status === "approved" && canVerify && (
            <Button onClick={checkout}><DoorOpen className="h-4 w-4" /> Mark Checked Out</Button>
          )}
          {gp.status === "checked_out" && canVerify && (
            <div className="space-y-2">
              <Label>Condition on return</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="missing_parts">Missing parts</SelectItem>
                  <SelectItem value="needs_repair">Needs repair</SelectItem>
                </SelectContent>
              </Select>
              <Label>Verification notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              <Button onClick={returnAsset}><PackageCheck className="h-4 w-4" /> Verify Return</Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={downloadPdf} disabled={!gp.pass_number && gp.status === "pending"}>
            <FileDown className="h-4 w-4" /> Download Gate Pass PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, full }: { label: string; value: any; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}
