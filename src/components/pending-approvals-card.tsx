import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown, CheckCircle2, XCircle, Eye, FileDown, FileSpreadsheet, X,
} from "lucide-react";
import { decideApproval } from "@/lib/approvals";
import { useAuth, ApprovalKind, ALL_APPROVAL_KINDS } from "@/hooks/use-auth";
import { ApprovalPayloadView } from "@/components/approval-payload-view";
import { fmtDateTimeEAT } from "@/lib/time";
import autoTable from "jspdf-autotable";
import { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } from "@/lib/pdf-template";

export function PendingApprovalsCard() {
  const { canApprove, canDo, user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [decideOpen, setDecideOpen] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [decideReason, setDecideReason] = useState("");
  const [detail, setDetail] = useState<any>(null);

  // ----- Filters -----
  const [f, setF] = useState<{ q: string; branch: string; location: string; kind: string }>({
    q: "", branch: "", location: "", kind: "",
  });
  const clearFilters = () => setF({ q: "", branch: "", location: "", kind: "" });
  const active = !!(f.q || f.branch || f.location || f.kind);

  const { data: rows = [] } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = data ?? [];
      const userIds = Array.from(new Set(list.map((r: any) => r.requested_by).filter(Boolean)));
      const assetIds = Array.from(new Set(list.map((r: any) => r.asset_id).filter(Boolean)));
      const [profsRes, assetsRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
        assetIds.length ? supabase.from("assets").select("id,name,asset_tag,branch_id,location_id").in("id", assetIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const profMap = Object.fromEntries(((profsRes as any).data ?? []).map((p: any) => [p.id, p]));
      const assetMap = Object.fromEntries(((assetsRes as any).data ?? []).map((a: any) => [a.id, a]));
      return list.map((r: any) => ({ ...r, requester: profMap[r.requested_by] ?? null, asset: assetMap[r.asset_id] ?? null }));
    },
    refetchInterval: 10000,
  });

  // Lookup tables to resolve branch/location names from IDs (asset's own + payload ids).
  const { data: branches = [] } = useQuery({
    queryKey: ["lookup-branches"],
    queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [],
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["lookup-locations"],
    queryFn: async () => (await supabase.from("locations").select("id,name")).data ?? [],
  });
  const branchMap = useMemo(() => Object.fromEntries(branches.map((b: any) => [b.id, b.name])), [branches]);
  const locMap = useMemo(() => Object.fromEntries(locations.map((l: any) => [l.id, l.name])), [locations]);

  const resolveBranchName = (r: any) => {
    const p = r.payload ?? {};
    const ids = [r.asset?.branch_id, p.branch_id, p.to_branch_id, p.from_branch_id].filter(Boolean);
    return ids.map((id: string) => branchMap[id]).filter(Boolean).join(" / ");
  };
  const resolveLocationName = (r: any) => {
    const p = r.payload ?? {};
    const ids = [r.asset?.location_id, p.location_id, p.to_location_id, p.from_location_id].filter(Boolean);
    return ids.map((id: string) => locMap[id]).filter(Boolean).join(" / ");
  };

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (f.kind && r.kind !== f.kind) return false;
    if (f.q) {
      const hay = `${r.asset?.name ?? ""} ${r.asset?.asset_tag ?? ""}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    if (f.branch && !resolveBranchName(r).toLowerCase().includes(f.branch.toLowerCase())) return false;
    if (f.location && !resolveLocationName(r).toLowerCase().includes(f.location.toLowerCase())) return false;
    return true;
  }), [rows, f, branchMap, locMap]);

  // Deep link
  const search = location.search as any;
  const approvalId: string | undefined = search?.approval;
  const action: string | undefined = search?.action;
  useEffect(() => {
    if (!approvalId) return;
    let cancelled = false;
    (async () => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      let row: any = rows.find((r: any) => r.id === approvalId);
      if (!row) {
        const { data } = await supabase.from("approval_requests").select("*").eq("id", approvalId).maybeSingle();
        if (!data) { nav({ to: "/dashboard", search: {} as any, replace: true }); return; }
        const [{ data: prof }, { data: asset }] = await Promise.all([
          data.requested_by ? supabase.from("profiles").select("id,full_name,email").eq("id", data.requested_by).maybeSingle() : Promise.resolve({ data: null }),
          data.asset_id ? supabase.from("assets").select("id,name,asset_tag,branch_id,location_id").eq("id", data.asset_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        row = { ...data, requester: prof, asset };
      }
      if (cancelled) return;
      const isPending = row.status === "pending";
      if (isPending && (action === "approve" || action === "reject")) {
        const allowed = canApprove(row.kind) && (isAdmin || row.requested_by !== user?.id || canDo("approve_own_request"));
        if (allowed) {
          setDecideReason("");
          setDecideOpen({ id: row.id, status: action === "approve" ? "approved" : "rejected" });
        } else { setDetail(row); }
      } else { setDetail(row); }
      nav({ to: "/dashboard", search: {} as any, replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalId, action]);

  const handleDecide = async (id: string, status: "approved" | "rejected", reason?: string) => {
    try {
      await decideApproval(id, status, reason);
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); qc.invalidateQueries({ queryKey: ["tile-assets"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-detail"] });
      qc.invalidateQueries({ queryKey: ["asset-attachments"] });
    } catch (e: any) { console.error(e); }
  };

  // ---- Export helpers ----
  const buildExportRows = () => filtered.map((r: any) => ({
    type: String(r.kind).replace(/_/g, " "),
    asset: r.asset ? `${r.asset.name ?? ""}${r.asset.asset_tag ? ` (${r.asset.asset_tag})` : ""}` : "—",
    branch: resolveBranchName(r) || "—",
    location: resolveLocationName(r) || "—",
    requester: r.requester?.full_name || r.requester?.email || "—",
    requested_at: fmtDateTimeEAT(r.created_at),
    reason: r.reason ?? "",
    status: r.status,
    decision: r.status === "pending" ? "—" : r.status,
  }));

  const HEAD = ["Type", "Asset", "Branch", "Location", "Requester", "Requested at (EAT)", "Reason", "Status", "Final decision"];
  const KEYS = ["type", "asset", "branch", "location", "requester", "requested_at", "reason", "status", "decision"] as const;

  const exportCSV = () => {
    const data = buildExportRows();
    const csv = [HEAD.join(","), ...data.map((row) =>
      KEYS.map((k) => `"${String((row as any)[k] ?? "").replace(/"/g, '""')}"`).join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pending-approvals-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const exportPDF = async () => {
    const tpl = await loadTemplate();
    const { doc, startY } = createBrandedPdf({
      template: tpl, orientation: "landscape",
      title: "Pending Approvals & Requisitions",
      subtitle: `${filtered.length} row(s) · generated ${fmtDateTimeEAT(new Date())} EAT`,
    });
    const data = buildExportRows();
    autoTable(doc, {
      startY,
      head: [HEAD],
      body: data.map((r) => KEYS.map((k) => String((r as any)[k] ?? ""))),
      styles: { fontSize: 7, font: tpl.font_family },
      headStyles: { fillColor: tableHeadFill(tpl) },
      margin: { left: tpl.margin_left, right: tpl.margin_right, bottom: tpl.margin_bottom },
    });
    saveBranded(doc, tpl, `pending-approvals-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <Card className="p-5" ref={cardRef as any}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pending approvals &amp; requisitions</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered.length}{filtered.length !== rows.length ? ` / ${rows.length}` : ""}</Badge>
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <FileSpreadsheet className="mr-1 h-3 w-3" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF} disabled={filtered.length === 0}>
            <FileDown className="mr-1 h-3 w-3" /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-3 grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Asset name / tag</Label>
          <Input className="h-8 text-xs" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search asset…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Branch</Label>
          <Input className="h-8 text-xs" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="Branch name…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Location</Label>
          <Input className="h-8 text-xs" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location name…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Approval type</Label>
          <Select value={f.kind || "__all"} onValueChange={(v) => setF({ ...f, kind: v === "__all" ? "" : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All types</SelectItem>
              {ALL_APPROVAL_KINDS.map((k) => (
                <SelectItem key={k} value={k} className="capitalize">{k.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {active && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Button size="sm" variant="ghost" onClick={clearFilters}><X className="mr-1 h-3 w-3" />Clear filters</Button>
          </div>
        )}
      </div>

      <div className="mt-2 divide-y">
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "Nothing waiting for approval." : "No approvals match your filters."}
          </p>
        )}
        {filtered.map((r: any) => {
          const kind = r.kind as ApprovalKind;
          const isOwn = r.requested_by === user?.id;
          const allowed = canApprove(kind) && (isAdmin || !isOwn || canDo("approve_own_request"));
          const br = resolveBranchName(r); const lc = resolveLocationName(r);
          return (
            <div key={r.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">{r.kind.replace(/_/g, " ")}</Badge>
                  <p className="truncate text-sm font-medium">{r.asset?.name ?? "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.asset?.asset_tag ?? ""} · by {r.requester?.full_name || r.requester?.email || "user"} · {fmtDateTimeEAT(r.created_at)}
                </p>
                {(br || lc) && (
                  <p className="text-xs text-muted-foreground">{br}{br && lc ? " · " : ""}{lc}</p>
                )}
                {r.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">"{r.reason}"</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Action <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDetail(r)}>
                    <Eye className="mr-2 h-4 w-4" /> Review details
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!allowed} onClick={() => { if (!allowed) return; setDecideReason(""); setDecideOpen({ id: r.id, status: "approved" }); }}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve…
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!allowed} onClick={() => { if (!allowed) return; setDecideReason(""); setDecideOpen({ id: r.id, status: "rejected" }); }}>
                    <XCircle className="mr-2 h-4 w-4 text-destructive" /> Reject…
                  </DropdownMenuItem>
                  {!allowed && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      {isOwn ? "You need the 'Approve own request' right" : "You don't have rights to approve this kind"}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{detail?.kind?.replace(/_/g, " ")} request</DialogTitle>
            <DialogDescription>
              {detail?.asset?.name} {detail?.asset?.asset_tag ? `(${detail.asset.asset_tag})` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Requested by</p>
                <p>{detail.requester?.full_name || detail.requester?.email || "—"} · {fmtDateTimeEAT(detail.created_at)} EAT</p>
              </div>
              {resolveBranchName(detail) && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Branch</p>
                  <p>{resolveBranchName(detail)}</p>
                </div>
              )}
              {resolveLocationName(detail) && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Location</p>
                  <p>{resolveLocationName(detail)}</p>
                </div>
              )}
              {detail.reason && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Reason</p>
                  <p className="whitespace-pre-line">{detail.reason}</p>
                </div>
              )}
              {detail.payload && Object.keys(detail.payload).length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-2">Details</p>
                  <div className="rounded-md border bg-card p-3">
                    <ApprovalPayloadView payload={detail.payload} />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decideOpen} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideOpen?.status === "approved" ? "Reason for approval" : "Reason for rejection"}
            </DialogTitle>
            <DialogDescription>
              A short note is required so the requester understands the decision.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={decideReason} onChange={(e) => setDecideReason(e.target.value)}
            placeholder={decideOpen?.status === "approved"
              ? "e.g. Approved — proceed with the transfer."
              : "Explain why this request is being rejected…"} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOpen(null)}>Cancel</Button>
            <Button
              variant={decideOpen?.status === "approved" ? "default" : "destructive"}
              disabled={!decideReason.trim()}
              onClick={async () => {
                if (decideOpen) await handleDecide(decideOpen.id, decideOpen.status, decideReason.trim());
                setDecideOpen(null);
              }}
            >
              {decideOpen?.status === "approved" ? "Approve request" : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
