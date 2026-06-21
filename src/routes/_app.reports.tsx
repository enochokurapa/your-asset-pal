import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileBarChart, FileDown, FileSpreadsheet, X } from "lucide-react";

import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatUGX } from "@/lib/utils";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } from "@/lib/pdf-template";
import { fmtDateEAT, fmtDateTimeEAT } from "@/lib/time";


export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type Column = { header: string; key: string; isCurrency?: boolean; isDate?: boolean; isDateTime?: boolean; isMultiline?: boolean };
type Report = { title: string; columns: Column[]; rows: any[] };

const CHART_COLORS = [
  "hsl(220 70% 50%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)",
  "hsl(280 65% 55%)", "hsl(180 60% 45%)", "hsl(330 70% 55%)", "hsl(45 90% 55%)",
];

function fmtCell(v: any, isCurrency?: boolean) {
  if (v === null || v === undefined || v === "") return "";
  if (isCurrency) return formatUGX(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function fmtColumn(row: any, c: Column) {
  const v = row[c.key];
  if (c.isDateTime) return fmtDateTimeEAT(v);
  if (c.isDate) return fmtDateEAT(v);
  if (c.isMultiline && Array.isArray(v)) return v.join("\n");
  return fmtCell(v, c.isCurrency);
}
async function exportPDF(r: Report) {
  const template = await loadTemplate();
  const { doc, startY } = createBrandedPdf({
    template, orientation: "landscape", title: r.title, subtitle: `${r.rows.length} row(s)`,
  });
  autoTable(doc, {
    startY,
    head: [r.columns.map((c) => c.header)],
    body: r.rows.map((row) => r.columns.map((c) => fmtColumn(row, c))),
    styles: { fontSize: 7, font: template.font_family },
    headStyles: { fillColor: tableHeadFill(template) },
    margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
  });
  saveBranded(doc, template, `${r.title.replace(/\s+/g, "_")}.pdf`);
}

function exportXLSX(r: Report) {
  const data = r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c.header, fmtColumn(row, c)])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, r.title.slice(0, 30));
  XLSX.writeFile(wb, `${r.title.replace(/\s+/g, "_")}.xlsx`);
}

type FilterDef = {
  key: string;
  label: string;
  type: "text" | "select" | "date";
  options?: { value: string; label: string }[];
};

function FilterBar({
  defs, values, onChange,
}: { defs: FilterDef[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const reset = () => onChange(Object.fromEntries(defs.map((d) => [d.key, ""])));
  const active = defs.some((d) => values[d.key]);
  return (
    <div className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 md:grid-cols-4">
      {defs.map((d) => (
        <div key={d.key} className="space-y-1">
          <Label className="text-xs">{d.label}</Label>
          {d.type === "select" ? (
            <Select value={values[d.key] || "__all"} onValueChange={(v) => onChange({ ...values, [d.key]: v === "__all" ? "" : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All</SelectItem>
                {(d.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input type={d.type === "date" ? "date" : "text"} className="h-8 text-xs"
              value={values[d.key] ?? ""} onChange={(e) => onChange({ ...values, [d.key]: e.target.value })} />
          )}
        </div>
      ))}
      {active && (
        <div className="flex items-end">
          <Button size="sm" variant="ghost" onClick={reset}><X className="mr-1 h-3 w-3" />Clear filters</Button>
        </div>
      )}
    </div>
  );
}

function applyDate(val: any, from?: string, to?: string) {
  if (!val) return !from && !to;
  const d = String(val).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
function applyText(val: any, q?: string) {
  if (!q) return true;
  return String(val ?? "").toLowerCase().includes(q.toLowerCase());
}

function ReportsPage() {
  const { canView, loading, canSeeBranch } = useAuth();
  const [tab, setTab] = useState("register");

  const { data: assets = [] } = useQuery({
    queryKey: ["report-assets"],
    queryFn: async () => (await supabase.from("assets")
      .select("*, categories(name,parent_id), locations(name,parent_id), branches(name,code)")
      .order("asset_tag")).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => (await supabase.from("categories").select("id,name,parent_id")).data ?? [],
  });
  const { data: locationsAll = [] } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () => (await supabase.from("locations").select("id,name,parent_id")).data ?? [],
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => (await supabase.from("branches").select("id,name,code")).data ?? [],
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["report-assignments"],
    queryFn: async () => (await supabase.from("asset_assignments")
      .select("*, assets(asset_tag, name), branches(name)")
      .order("assignment_date", { ascending: false })).data ?? [],
  });
  const { data: movements = [] } = useQuery({
    queryKey: ["report-movements"],
    queryFn: async () => (await supabase.from("asset_movements")
      .select("*, assets(asset_tag, name), from:from_location_id(name), to:to_location_id(name), fromBranch:from_branch_id(name), toBranch:to_branch_id(name)")
      .order("moved_at", { ascending: false })).data ?? [],
  });
  const { data: disposals = [] } = useQuery({
    queryKey: ["report-disposals"],
    queryFn: async () => (await supabase.from("asset_disposals")
      .select("*, assets(asset_tag, name)")
      .order("disposal_date", { ascending: false })).data ?? [],
  });
  const { data: approvals = [] } = useQuery({
    queryKey: ["report-approvals"],
    queryFn: async () => (await supabase.from("approval_requests")
      .select("*")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p: any) => [p.id, p])), [profiles]);
  const { data: verifications = [] } = useQuery({
    queryKey: ["report-verifications"],
    queryFn: async () => (await (supabase as any).from("asset_verifications")
      .select("*, assets(asset_tag,name,serial_number), branches(name), locations(name)")
      .order("verified_at", { ascending: false })).data ?? [],
  });
  const { data: depreciationEntries = [] } = useQuery({
    queryKey: ["report-depreciation-entries"],
    queryFn: async () => (await supabase.from("depreciation_entries" as any)
      .select("*, assets(asset_tag,name,branch_id), depreciation_runs(period_start,period_end,run_type,status,triggered_by)")
      .order("period_end", { ascending: false })).data ?? [],
  });
  const { data: gatePasses = [] } = useQuery({
    queryKey: ["report-gate-passes"],
    queryFn: async () => (await (supabase as any).from("gate_passes")
      .select("*, assets(asset_tag,name), branches(name)")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const userLabel = (id: string | null | undefined) => {
    if (!id) return "";
    const p = profileMap[id];
    return p?.full_name || p?.email || "";
  };

  const catMap = useMemo(() => Object.fromEntries(categories.map((c: any) => [c.id, c])), [categories]);
  const locMap = useMemo(() => Object.fromEntries(locationsAll.map((l: any) => [l.id, l])), [locationsAll]);

  const currentAssignment: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    assignments.forEach((a: any) => { if (!map[a.asset_id]) map[a.asset_id] = a; });
    return map;
  }, [assignments]);

  const enrichedAssets = useMemo(() => assets
    .filter((a: any) => canSeeBranch(a.branch_id))
    .map((a: any) => {
      const cat = a.categories;
      const parentCat = cat?.parent_id ? catMap[cat.parent_id] : null;
      const loc = a.locations;
      const parentLoc = loc?.parent_id ? locMap[loc.parent_id] : null;
      const assn = currentAssignment[a.id];
      return {
        ...a,
        branch: a.branches?.name ?? "",
        branch_code: a.branches?.code ?? "",
        category: parentCat?.name ?? cat?.name ?? "",
        sub_category: parentCat ? cat?.name : "",
        location: parentLoc?.name ?? loc?.name ?? "",
        sub_location: parentLoc ? loc?.name : "",
        assigned_to: assn?.assigned_to_name ?? "",
        department: assn?.department ?? "",
      };
    }), [assets, catMap, locMap, currentAssignment, canSeeBranch]);

  const assetMap = useMemo(
    () => Object.fromEntries(enrichedAssets.map((a: any) => [a.id, a])),
    [enrichedAssets],
  );
  const allAssetMap = useMemo(
    () => Object.fromEntries((assets as any[]).map((a: any) => [a.id, a])),
    [assets],
  );
  const assetFor = (assetId: string | null | undefined) => (assetId ? assetMap[assetId] : null);

  // Restrict ancillary lists to assets the user can see
  const visibleAssetIds = useMemo(
    () => new Set(enrichedAssets.map((a: any) => a.id)),
    [enrichedAssets],
  );
  const scopedAssignments = useMemo(
    () => (assignments as any[]).filter((a) => visibleAssetIds.has(a.asset_id) && canSeeBranch(a.branch_id)),
    [assignments, visibleAssetIds, canSeeBranch],
  );
  const scopedMovements = useMemo(
    () => (movements as any[]).filter((m) =>
      visibleAssetIds.has(m.asset_id) &&
      (canSeeBranch(m.from_branch_id) || canSeeBranch(m.to_branch_id)),
    ),
    [movements, visibleAssetIds, canSeeBranch],
  );
  const scopedDisposals = useMemo(
    () => (disposals as any[]).filter((d) => visibleAssetIds.has(d.asset_id)),
    [disposals, visibleAssetIds],
  );
  const scopedApprovals = useMemo(
    () => (approvals as any[]).filter((p) => {
      const rawAsset = p.asset_id ? allAssetMap[p.asset_id] : null;
      return !p.asset_id || !rawAsset || canSeeBranch(rawAsset.branch_id);
    }),
    [approvals, allAssetMap, canSeeBranch],
  );
  const scopedVerifications = useMemo(
    () => (verifications as any[]).filter((v) => visibleAssetIds.has(v.asset_id) && canSeeBranch(v.branch_id)),
    [verifications, visibleAssetIds, canSeeBranch],
  );
  const scopedDepreciationEntries = useMemo(
    () => (depreciationEntries as any[]).filter((e) => visibleAssetIds.has(e.asset_id) && canSeeBranch(e.assets?.branch_id)),
    [depreciationEntries, visibleAssetIds, canSeeBranch],
  );
  const scopedGatePasses = useMemo(
    () => (gatePasses as any[]).filter((g) => visibleAssetIds.has(g.asset_id) && canSeeBranch(g.branch_id)),
    [gatePasses, visibleAssetIds, canSeeBranch],
  );
  const scopedBranches = useMemo(
    () => (branches as any[]).filter((b) => canSeeBranch(b.id)),
    [branches, canSeeBranch],
  );

  // Shared option lists
  const branchOpts = scopedBranches.map((b: any) => ({ value: b.id, label: b.name }));
  const categoryOpts = categories.filter((c: any) => !c.parent_id).map((c: any) => ({ value: c.id, label: c.name }));
  const statusOpts = ["in_use", "in_storage", "under_repair", "retired", "missing", "disposed"]
    .map((s) => ({ value: s, label: s.replace("_", " ") }));
  const movementTypeOpts = [{ value: "internal", label: "Internal" }, { value: "external", label: "External" }];
  const approvalKindOpts = ["movement", "retirement", "disposal", "maintenance", "reactivation", "set_for_disposal", "deletion", "attachment_deletion"]
    .map((k) => ({ value: k, label: k.replace(/_/g, " ") }));
  const approvalStatusOpts = ["pending", "approved", "rejected"].map((s) => ({ value: s, label: s }));
  const priorityOpts = ["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p }));
  const verificationStatusOpts = ["verified", "mismatched", "not_found"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }));
  const gatePassStatusOpts = ["pending", "approved", "rejected", "checked_out", "returned", "cancelled"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }));

  /* ----------- Filters state per tab ----------- */
  const [fRegister, setFRegister] = useState<Record<string, string>>({});
  const [fMove, setFMove] = useState<Record<string, string>>({});
  const [fAssign, setFAssign] = useState<Record<string, string>>({});
  const [fDisposal, setFDisposal] = useState<Record<string, string>>({});
  const [fMaint, setFMaint] = useState<Record<string, string>>({});
  const [fApprov, setFApprov] = useState<Record<string, string>>({});
  const [fVerification, setFVerification] = useState<Record<string, string>>({});
  const [fDepreciation, setFDepreciation] = useState<Record<string, string>>({});
  const [fGatePass, setFGatePass] = useState<Record<string, string>>({});

  /* ----------- Register ----------- */
  const registerDefs: FilterDef[] = [
    { key: "q", label: "Search (tag/name/serial)", type: "text" },
    { key: "branch_id", label: "Branch", type: "select", options: branchOpts },
    { key: "category_id", label: "Category", type: "select", options: categoryOpts },
    { key: "status", label: "Status", type: "select", options: statusOpts },
    { key: "from", label: "Purchased from", type: "date" },
    { key: "to", label: "Purchased to", type: "date" },
  ];
  const registerRows = enrichedAssets.filter((a: any) =>
    (!fRegister.branch_id || a.branch_id === fRegister.branch_id) &&
    (!fRegister.category_id || a.category_id === fRegister.category_id || catMap[a.category_id]?.parent_id === fRegister.category_id) &&
    (!fRegister.status || a.status === fRegister.status) &&
    applyDate(a.purchase_date, fRegister.from, fRegister.to) &&
    (!fRegister.q ||
      applyText(a.asset_tag, fRegister.q) || applyText(a.name, fRegister.q) || applyText(a.serial_number, fRegister.q)),
  );
  const register: Report = {
    title: "Fixed Asset Register",
    columns: [
      { header: "Tag", key: "asset_tag" }, { header: "Serial #", key: "serial_number" },
      { header: "Name", key: "name" }, { header: "Description", key: "description" },
      { header: "Category", key: "category" }, { header: "Sub-category", key: "sub_category" },
      { header: "Branch", key: "branch" }, { header: "Location", key: "location" },
      { header: "Sub-location", key: "sub_location" }, { header: "Assigned to", key: "assigned_to" },
      { header: "Department", key: "department" }, { header: "Status", key: "status" },
      { header: "Purchase Date", key: "purchase_date" },
      { header: "Purchase Value", key: "purchase_value", isCurrency: true },
    ],
    rows: registerRows,
  };

  /* ----------- Movements ----------- */
  const movementDefs: FilterDef[] = [
    { key: "q", label: "Search (tag/asset/reason)", type: "text" },
    { key: "transfer_type", label: "Type", type: "select", options: movementTypeOpts },
    { key: "from_branch_id", label: "From branch", type: "select", options: branchOpts },
    { key: "to_branch_id", label: "To branch", type: "select", options: branchOpts },
    { key: "status", label: "Status", type: "select", options: [
      { value: "recorded", label: "Recorded" },
      ...approvalStatusOpts,
    ] },
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];

  // Build a unified movement list combining executed movements + every movement
  // approval request (pending/approved/rejected) so reports never appear empty
  // just because an approval was decided without a separate movement row.
  const branchById = (id: string | null | undefined) => (id ? branches.find((b: any) => b.id === id) : null);
  const locById = (id: string | null | undefined) => (id ? locationsAll.find((l: any) => l.id === id) : null);
  const uniqueNames = (names: Array<string | null | undefined>) => Array.from(new Set(names.filter(Boolean) as string[])).join(" / ");

  const recordedMovementRows = scopedMovements.map((m: any) => ({
    tag: m.assets?.asset_tag, name: m.assets?.name,
    from_loc: m.from?.name ?? "", to_loc: m.to?.name ?? "",
    from_branch: m.fromBranch?.name ?? "", to_branch: m.toBranch?.name ?? "",
    from_user: m.from_user ?? "", to_user: m.to_user ?? "",
    transfer_type: m.transfer_type ?? "internal",
    moved_at: m.moved_at, reason: m.reason ?? "",
    status: "recorded",
    requested_by: "", approver: "",
    _from_branch_id: m.from_branch_id, _to_branch_id: m.to_branch_id,
  }));
  const approvalMovementRows = scopedApprovals.filter((r: any) => r.kind === "movement").map((r: any) => {
    const p = r.payload ?? {};
    const asset = assetFor(r.asset_id);
    const requester = profileMap[r.requested_by];
    const approver = r.approver_id ? profileMap[r.approver_id] : null;
    return {
      tag: asset?.asset_tag, name: asset?.name,
      from_loc: locById(p.from_location_id)?.name ?? "",
      to_loc: locById(p.to_location_id)?.name ?? "",
      from_branch: branchById(p.from_branch_id)?.name ?? "",
      to_branch: branchById(p.to_branch_id)?.name ?? "",
      from_user: p.from_user ?? "", to_user: p.to_user ?? "",
      transfer_type: p.transfer_type ?? "internal",
      moved_at: p.moved_at ?? String(r.created_at).slice(0, 10),
      reason: r.reason ?? p.reason ?? "",
      status: r.status ?? "pending",
      requested_by: requester?.full_name ?? requester?.email ?? "",
      approver: approver?.full_name ?? approver?.email ?? "",
      _from_branch_id: p.from_branch_id, _to_branch_id: p.to_branch_id,
    };
  });
  const movementRows = [...recordedMovementRows, ...approvalMovementRows].filter((m: any) =>
    (!fMove.transfer_type || (m.transfer_type ?? "internal") === fMove.transfer_type) &&
    (!fMove.from_branch_id || m._from_branch_id === fMove.from_branch_id) &&
    (!fMove.to_branch_id || m._to_branch_id === fMove.to_branch_id) &&
    (!fMove.status || m.status === fMove.status) &&
    applyDate(m.moved_at, fMove.from, fMove.to) &&
    (!fMove.q || applyText(m.tag, fMove.q) || applyText(m.name, fMove.q) || applyText(m.reason, fMove.q)),
  );
  const movementReport: Report = {
    title: "Asset Movement Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "From location", key: "from_loc" }, { header: "To location", key: "to_loc" },
      { header: "From branch", key: "from_branch" }, { header: "To branch", key: "to_branch" },
      { header: "From person", key: "from_user" }, { header: "To person", key: "to_user" },
      { header: "Type", key: "transfer_type" }, { header: "Date", key: "moved_at" },
      { header: "Status", key: "status" }, { header: "Requested by", key: "requested_by" },
      { header: "Approver", key: "approver" },
      { header: "Reason", key: "reason" },
    ],
    rows: movementRows,
  };

  /* ----------- Assigned ----------- */
  const assignDefs: FilterDef[] = [
    { key: "q", label: "Search (employee/dept/asset)", type: "text" },
    { key: "branch_id", label: "Branch", type: "select", options: branchOpts },
    { key: "from", label: "Assigned from", type: "date" },
    { key: "to", label: "Assigned to", type: "date" },
  ];
  const assignRows = scopedAssignments.filter((a: any) =>
    (!fAssign.branch_id || a.branch_id === fAssign.branch_id) &&
    applyDate(a.assignment_date, fAssign.from, fAssign.to) &&
    (!fAssign.q || applyText(a.assigned_to_name, fAssign.q) || applyText(a.department, fAssign.q)
      || applyText(a.assets?.asset_tag, fAssign.q) || applyText(a.assets?.name, fAssign.q)),
  ).map((a: any) => ({
    tag: a.assets?.asset_tag, name: a.assets?.name,
    assigned_to_name: a.assigned_to_name ?? "", department: a.department ?? "",
    branch: a.branches?.name ?? "",
    assignment_date: a.assignment_date, return_date: a.return_date ?? "",
  }));
  const assignedReport: Report = {
    title: "Assigned Assets Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "Employee", key: "assigned_to_name" }, { header: "Department", key: "department" },
      { header: "Branch", key: "branch" },
      { header: "Assigned", key: "assignment_date" }, { header: "Return", key: "return_date" },
    ],
    rows: assignRows,
  };

  /* ----------- Retire/Dispose ----------- */
  const disposalDefs: FilterDef[] = [
    { key: "q", label: "Search (tag/asset/reason)", type: "text" },
    { key: "type", label: "Type", type: "select", options: [{ value: "Retirement", label: "Retirement" }, { value: "Disposal", label: "Disposal" }] },
    { key: "status", label: "Status", type: "select", options: [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "recorded", label: "Recorded" }] },
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];
  const recordedDisposalRows = scopedDisposals.map((d: any) => ({
    tag: d.assets?.asset_tag, name: d.assets?.name,
    type: d.retirement_reason ? "Retirement" : "Disposal",
    disposal_reason: d.disposal_reason ?? d.retirement_reason ?? "",
    disposal_date: d.disposal_date,
    disposal_value: d.disposal_value, status: d.status ?? "recorded",
    approval_notes: d.approval_notes ?? "",
    requested_by: "", approver: "",
  }));
  const approvalDisposalRows = scopedApprovals
    .filter((r: any) => r.kind === "disposal" || r.kind === "retirement")
    .map((r: any) => {
      const p = r.payload ?? {};
      const asset = assetFor(r.asset_id);
      const requester = profileMap[r.requested_by];
      const approver = r.approver_id ? profileMap[r.approver_id] : null;
      return {
        tag: asset?.asset_tag, name: asset?.name,
        branch: asset?.branch ?? "", location: asset?.location ?? "",
        type: r.kind === "retirement" ? "Retirement" : "Disposal",
        disposal_reason: r.reason ?? "",
        disposal_date: p.date ?? String(r.created_at).slice(0, 10),
        disposal_value: p.disposal_value ?? null,
        status: r.status ?? "pending",
        approval_notes: p.notes ?? "",
        requested_by: requester?.full_name ?? requester?.email ?? "",
        approver: approver?.full_name ?? approver?.email ?? "",
      };
    });
  const disposalRows = [...recordedDisposalRows, ...approvalDisposalRows].filter((r: any) =>
    (!fDisposal.type || r.type === fDisposal.type) &&
    (!fDisposal.status || r.status === fDisposal.status) &&
    applyDate(r.disposal_date, fDisposal.from, fDisposal.to) &&
    (!fDisposal.q || applyText(r.tag, fDisposal.q) || applyText(r.name, fDisposal.q) || applyText(r.disposal_reason, fDisposal.q)),
  );
  const disposalReport: Report = {
    title: "Retirement & Disposal Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "Branch", key: "branch" }, { header: "Location", key: "location" },
      { header: "Type", key: "type" }, { header: "Reason", key: "disposal_reason" },
      { header: "Date", key: "disposal_date" }, { header: "Value", key: "disposal_value", isCurrency: true },
      { header: "Status", key: "status" },
      { header: "Requested by", key: "requested_by" }, { header: "Approver", key: "approver" },
      { header: "Notes", key: "approval_notes" },
    ],
    rows: disposalRows,
  };

  /* ----------- Maintenance ----------- */
  const maintenanceDefs: FilterDef[] = [
    { key: "q", label: "Search (asset/issue)", type: "text" },
    { key: "status", label: "Status", type: "select", options: approvalStatusOpts },
    { key: "priority", label: "Priority", type: "select", options: priorityOpts },
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];
  const maintenanceRows = scopedApprovals.filter((r: any) => r.kind === "maintenance" || r.kind === "reactivation").map((r: any) => {
    const p = r.payload ?? {};
    const asset = assetFor(r.asset_id);
    const requester = profileMap[r.requested_by];
    const approver = r.approver_id ? profileMap[r.approver_id] : null;
    return {
      tag: asset?.asset_tag, name: asset?.name,
      branch: asset?.branch ?? "", location: asset?.location ?? "",
      type: r.kind === "reactivation" ? "Return from repair" : "Maintenance",
      issue: r.reason ?? "", priority: p.priority ?? "",
      scheduled_for: p.scheduled_for ?? "", estimated_cost: p.estimated_cost ?? null,
      notes: p.notes ?? "", status: r.status ?? "pending",
      requested_by: requester?.full_name ?? requester?.email ?? "",
      approver: approver?.full_name ?? approver?.email ?? "",
      created_at: String(r.created_at).slice(0, 10),
      decided_at: r.decided_at ? String(r.decided_at).slice(0, 10) : "",
    };
  }).filter((r: any) =>
    (!fMaint.status || r.status === fMaint.status) &&
    (!fMaint.priority || r.priority === fMaint.priority) &&
    applyDate(r.created_at, fMaint.from, fMaint.to) &&
    (!fMaint.q || applyText(r.tag, fMaint.q) || applyText(r.name, fMaint.q) || applyText(r.issue, fMaint.q)),
  );
  const maintenanceReport: Report = {
    title: "Maintenance Requisitions",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "Branch", key: "branch" }, { header: "Location", key: "location" },
      { header: "Type", key: "type" }, { header: "Issue", key: "issue" }, { header: "Priority", key: "priority" },
      { header: "Scheduled", key: "scheduled_for" },
      { header: "Est. cost", key: "estimated_cost", isCurrency: true },
      { header: "Status", key: "status" }, { header: "Requested by", key: "requested_by" },
      { header: "Approver", key: "approver" }, { header: "Requested on", key: "created_at" },
      { header: "Decided on", key: "decided_at" }, { header: "Notes", key: "notes" },
    ],
    rows: maintenanceRows,
  };

  /* ----------- Approvals (all) ----------- */
  const approvalDefs: FilterDef[] = [
    { key: "q", label: "Search (asset/reason)", type: "text" },
    { key: "kind", label: "Kind", type: "select", options: approvalKindOpts },
    { key: "status", label: "Status", type: "select", options: approvalStatusOpts },
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];
  const approvalRows = scopedApprovals.map((r: any) => {
    const asset = assetFor(r.asset_id);
    const p = r.payload ?? {};
    const requester = profileMap[r.requested_by];
    const approver = r.approver_id ? profileMap[r.approver_id] : null;
    return {
      kind: r.kind, status: r.status,
      tag: asset?.asset_tag, name: asset?.name,
      branch: uniqueNames([asset?.branch, branchById(p.from_branch_id)?.name, branchById(p.to_branch_id)?.name, branchById(p.branch_id)?.name]),
      location: uniqueNames([asset?.location, locById(p.from_location_id)?.name, locById(p.to_location_id)?.name, locById(p.location_id)?.name]),
      reason: r.reason ?? "",
      requested_by: requester?.full_name ?? requester?.email ?? "",
      approver: approver?.full_name ?? approver?.email ?? "",
      created_at: String(r.created_at).slice(0, 10),
      decided_at: r.decided_at ? String(r.decided_at).slice(0, 10) : "",
    };
  }).filter((r: any) =>
    (!fApprov.kind || r.kind === fApprov.kind) &&
    (!fApprov.status || r.status === fApprov.status) &&
    applyDate(r.created_at, fApprov.from, fApprov.to) &&
    (!fApprov.q || applyText(r.tag, fApprov.q) || applyText(r.name, fApprov.q) || applyText(r.reason, fApprov.q)),
  );
  const approvalReport: Report = {
    title: "Approval Requests Report",
    columns: [
      { header: "Kind", key: "kind" }, { header: "Status", key: "status" },
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "Branch", key: "branch" }, { header: "Location", key: "location" },
      { header: "Reason", key: "reason" }, { header: "Requested by", key: "requested_by" },
      { header: "Approver", key: "approver" }, { header: "Requested", key: "created_at" },
      { header: "Decided", key: "decided_at" },
    ],
    rows: approvalRows,
  };

  /* ----------- Verification ----------- */
  const verificationDefs: FilterDef[] = [
    { key: "q", label: "Search (tag/asset/custodian)", type: "text" },
    { key: "branch_id", label: "Branch", type: "select", options: branchOpts },
    { key: "status", label: "Status", type: "select", options: verificationStatusOpts },
    { key: "from", label: "Verified from", type: "date" },
    { key: "to", label: "Verified to", type: "date" },
  ];
  const verificationRows = scopedVerifications.map((v: any) => ({
    tag: v.assets?.asset_tag ?? "", name: v.assets?.name ?? "", serial_number: v.assets?.serial_number ?? "",
    branch: v.branches?.name ?? "", location: v.locations?.name ?? "",
    custodian_name: v.custodian_name ?? "", department: v.department ?? "",
    condition: v.condition ?? "", status: v.status ?? "",
    verified_by: userLabel(v.verified_by), verified_at: v.verified_at,
    notes: v.notes ?? "", changes: v.changes && Object.keys(v.changes).length ? JSON.stringify(v.changes) : "",
    _branch_id: v.branch_id,
  })).filter((v: any) =>
    (!fVerification.branch_id || v._branch_id === fVerification.branch_id) &&
    (!fVerification.status || v.status === fVerification.status) &&
    applyDate(v.verified_at, fVerification.from, fVerification.to) &&
    (!fVerification.q || applyText(v.tag, fVerification.q) || applyText(v.name, fVerification.q) || applyText(v.serial_number, fVerification.q) || applyText(v.custodian_name, fVerification.q)),
  );
  const verificationReport: Report = {
    title: "Fixed Asset Verification Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" }, { header: "Serial #", key: "serial_number" },
      { header: "Branch", key: "branch" }, { header: "Location", key: "location" },
      { header: "Custodian", key: "custodian_name" }, { header: "Department", key: "department" },
      { header: "Condition", key: "condition" }, { header: "Status", key: "status" },
      { header: "Verified by", key: "verified_by" }, { header: "Verified at", key: "verified_at", isDateTime: true },
      { header: "Notes", key: "notes" }, { header: "Changes", key: "changes" },
    ],
    rows: verificationRows,
  };

  /* ----------- Depreciation ----------- */
  const depreciationDefs: FilterDef[] = [
    { key: "q", label: "Search (tag/asset)", type: "text" },
    { key: "branch_id", label: "Branch", type: "select", options: branchOpts },
    { key: "from", label: "Period from", type: "date" },
    { key: "to", label: "Period to", type: "date" },
  ];
  const depreciationRows = scopedDepreciationEntries.map((e: any) => ({
    tag: e.assets?.asset_tag ?? "", name: e.assets?.name ?? "", branch: branchById(e.assets?.branch_id)?.name ?? "",
    period_start: e.period_start, period_end: e.period_end, method: e.method,
    opening_value: e.opening_value, depreciation_amount: e.depreciation_amount,
    accumulated_after: e.accumulated_after, closing_value: e.closing_value,
    run_type: e.depreciation_runs?.run_type ?? "", run_status: e.depreciation_runs?.status ?? "",
    triggered_by: userLabel(e.depreciation_runs?.triggered_by), created_at: e.created_at,
    _branch_id: e.assets?.branch_id,
  })).filter((e: any) =>
    (!fDepreciation.branch_id || e._branch_id === fDepreciation.branch_id) &&
    applyDate(e.period_end, fDepreciation.from, fDepreciation.to) &&
    (!fDepreciation.q || applyText(e.tag, fDepreciation.q) || applyText(e.name, fDepreciation.q)),
  );
  const depreciationReport: Report = {
    title: "Depreciation Entries Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" }, { header: "Branch", key: "branch" },
      { header: "Period start", key: "period_start", isDate: true }, { header: "Period end", key: "period_end", isDate: true },
      { header: "Method", key: "method" }, { header: "Opening", key: "opening_value", isCurrency: true },
      { header: "Depreciation", key: "depreciation_amount", isCurrency: true },
      { header: "Accumulated", key: "accumulated_after", isCurrency: true }, { header: "NBV", key: "closing_value", isCurrency: true },
      { header: "Run type", key: "run_type" }, { header: "Run status", key: "run_status" },
      { header: "Triggered by", key: "triggered_by" }, { header: "Recorded", key: "created_at", isDateTime: true },
    ],
    rows: depreciationRows,
  };

  /* ----------- Gate passes ----------- */
  const gatePassDefs: FilterDef[] = [
    { key: "q", label: "Search (pass/asset/destination)", type: "text" },
    { key: "branch_id", label: "Branch", type: "select", options: branchOpts },
    { key: "status", label: "Status", type: "select", options: gatePassStatusOpts },
    { key: "from", label: "Requested from", type: "date" },
    { key: "to", label: "Requested to", type: "date" },
  ];
  const gatePassRows = scopedGatePasses.map((g: any) => ({
    pass_number: g.pass_number ?? "", tag: g.assets?.asset_tag ?? "", name: g.assets?.name ?? "",
    branch: g.branches?.name ?? "", status: g.status ?? "", destination: g.destination ?? "",
    reason: g.reason ?? "", requested_by: userLabel(g.requested_by), created_at: g.created_at,
    approver: userLabel(g.approver_id), decided_at: g.decided_at,
    checked_out_by: userLabel(g.checked_out_by), checked_out_at: g.checked_out_at,
    returned_by: userLabel(g.returned_by), returned_at: g.returned_at,
    _branch_id: g.branch_id,
  })).filter((g: any) =>
    (!fGatePass.branch_id || g._branch_id === fGatePass.branch_id) &&
    (!fGatePass.status || g.status === fGatePass.status) &&
    applyDate(g.created_at, fGatePass.from, fGatePass.to) &&
    (!fGatePass.q || applyText(g.pass_number, fGatePass.q) || applyText(g.tag, fGatePass.q) || applyText(g.name, fGatePass.q) || applyText(g.destination, fGatePass.q)),
  );
  const gatePassReport: Report = {
    title: "Gate Pass Report",
    columns: [
      { header: "Pass #", key: "pass_number" }, { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "Branch", key: "branch" }, { header: "Status", key: "status" }, { header: "Destination", key: "destination" },
      { header: "Reason", key: "reason" }, { header: "Requested by", key: "requested_by" }, { header: "Requested", key: "created_at", isDateTime: true },
      { header: "Approver", key: "approver" }, { header: "Decided", key: "decided_at", isDateTime: true },
      { header: "Checked out by", key: "checked_out_by" }, { header: "Checked out", key: "checked_out_at", isDateTime: true },
      { header: "Returned by", key: "returned_by" }, { header: "Returned", key: "returned_at", isDateTime: true },
    ],
    rows: gatePassRows,
  };

  /* ----------- Audit trail ----------- */
  const branchMap = Object.fromEntries((branches as any[]).map((b: any) => [b.id, b]));
  const locationMap = Object.fromEntries((locationsAll as any[]).map((l: any) => [l.id, l]));

  const humanizeKey = (k: string) =>
    k.replace(/_id$/i, "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  const labelForId = (key: string, id: string): string => {
    const k = (key || "").toLowerCase();
    // Try asset lookup first whenever the key/entity hints at an asset
    if (k.includes("asset") && !k.includes("assignment") && !k.includes("movement") && !k.includes("disposal") && !k.includes("verification")) {
      const a = allAssetMap[id];
      if (a) return `${a.asset_tag ?? ""} ${a.name ?? ""}`.trim() || id;
    } else if (k === "assets") {
      const a = allAssetMap[id];
      if (a) return `${a.asset_tag ?? ""} ${a.name ?? ""}`.trim() || id;
    }
    if (k.includes("branch")) { const b = branchMap[id]; if (b) return b.name; }
    if (k.includes("location")) { const l = locationMap[id]; if (l) return l.name; }
    if (k.includes("category")) { const c = catMap[id]; if (c) return c.name; }
    if (k.includes("user") || k.includes("actor") || k.includes("by") || k.includes("approver") || k.includes("requester") || k.includes("requested") || k.includes("decided") || k === "profiles") {
      const u = userLabel(id); if (u) return u;
    }
    // Fallback: short record reference like "Approval Request #20a96cbe"
    const label = humanizeKey(k.replace(/s$/, ""));
    const short = id.length >= 8 ? id.slice(0, 8) : id;
    return `${label} #${short}`;
  };


  const isUuid = (v: any) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const valueToText = (key: string, val: any): string => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "number") return String(val);
    if (Array.isArray(val)) return val.map((v) => valueToText(key, v)).join(", ");
    if (typeof val === "object") {
      return Object.entries(val)
        .map(([k, v]) => `${humanizeKey(k)}: ${valueToText(k, v)}`)
        .join("; ");
    }
    const s = String(val);
    if (isUuid(s)) return labelForId(key, s);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return fmtDateTimeEAT(s);
    return s;
  };

  const detailsToLines = (details: any): string[] => {
    if (!details) return [];
    if (typeof details === "string") return [details];
    if (typeof details !== "object") return [String(details)];
    const skip = new Set(["id", "created_at", "updated_at", "asset_id"]);
    const lines: string[] = [];
    for (const [k, v] of Object.entries(details)) {
      if (skip.has(k)) continue;
      if (v === null || v === undefined || v === "") continue;
      if ((k === "before" || k === "after" || k === "changes") && typeof v === "object" && v) {
        for (const [kk, vv] of Object.entries(v as any)) {
          if (skip.has(kk)) continue;
          if (vv === null || vv === undefined || vv === "") continue;
          lines.push(`${humanizeKey(k)} ${humanizeKey(kk)}: ${valueToText(kk, vv)}`);
        }
        continue;
      }
      lines.push(`${humanizeKey(k)}: ${valueToText(k, v)}`);
    }
    return lines;
  };

  // Classify an audit row into a tracked activity. Returns null to skip.
  const classifyActivity = (r: any): { code: string; label: string } | null => {
    const entity = String(r.entity_type ?? "");
    const action = String(r.action ?? "").toLowerCase();
    const after = r.details?.after ?? r.details ?? {};
    const before = r.details?.before ?? {};
    const prettyKind = (k: any) => String(k ?? "").replace(/_/g, " ");

    if (entity === "assets") {
      if (action === "created") return { code: "created", label: "Asset created (data capture)" };
      if (action === "retired") return { code: "retired", label: "Asset retired" };
      if (action === "updated") return { code: "updated", label: "Asset details updated" };
    }
    if (entity === "asset_movements" && action === "created") {
      const t = after?.movement_type ? ` (${prettyKind(after.movement_type)})` : "";
      return { code: "moved", label: `Asset moved / transferred${t}` };
    }
    if (entity === "asset_assignments" && action === "created") {
      return { code: "assigned", label: "Asset assigned" };
    }
    if (entity === "asset_verifications" && action === "created") {
      const s = after?.status ? `: ${prettyKind(after.status)}` : "";
      return { code: "verified", label: `Asset verified${s}` };
    }
    if (entity === "asset_disposals") {
      if (action === "created") return { code: "disposed", label: "Disposal requested" };
      if (action === "disposal_approved") return { code: "disposed", label: "Disposal approved" };
      if (action === "disposal_completed") return { code: "disposed", label: "Asset disposed" };
      if (action === "disposal_rejected") return { code: "disposed", label: "Disposal rejected" };
    }
    if ((entity === "depreciation_entries" || entity === "depreciation_runs") && action === "created") {
      return { code: "depreciated", label: "Depreciation run" };
    }
    if (entity === "approval_requests") {
      const kind = prettyKind(after?.kind ?? before?.kind);
      if (action === "created") {
        if (kind === "maintenance") return { code: "maintenance", label: "Maintenance requested" };
        return { code: "requisition", label: `Requisition raised: ${kind}` };
      }
      if (action === "updated") {
        const oldStatus = before?.status;
        const newStatus = after?.status;
        if (oldStatus !== newStatus && newStatus) {
          return { code: "approval", label: `${kind} ${newStatus}` };
        }
      }
    }
    if (entity === "gate_passes") {
      if (action === "created") return { code: "gate_pass", label: "Gate pass requested" };
      if (action === "updated") {
        const oldStatus = before?.status;
        const newStatus = after?.status;
        if (oldStatus !== newStatus && newStatus) {
          return { code: "gate_pass", label: `Gate pass ${prettyKind(newStatus)}` };
        }
      }
    }
    return null;
  };

  const auditDefs: FilterDef[] = [
    { key: "q", label: "Search (activity/user)", type: "text" },
    { key: "activity", label: "Activity", type: "select", options: auditActivityOpts },
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];

  // Group tracked activities by asset, ordered chronologically (oldest first).
  const auditByAsset = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of scopedAuditRows as any[]) {
      const cls = classifyActivity(r);
      if (!cls) continue;
      const aid = r.entity_type === "assets"
        ? r.entity_id
        : (r.details?.asset_id ?? r.details?.after?.asset_id ?? r.details?.before?.asset_id);
      if (!aid) continue;
      (map[aid] ??= []).push({ ...r, _activityCode: cls.code, _activityLabel: cls.label });
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedAuditRows]);

  // Assets available for the audit picker — only those with at least one tracked activity.
  const auditAssetChoices = useMemo(() => {
    return (enrichedAssets as any[])
      .filter((a) => (auditByAsset[a.id]?.length ?? 0) > 0)
      .filter((a) => {
        if (!auditAssetQuery) return true;
        const q = auditAssetQuery.toLowerCase();
        return (a.asset_tag ?? "").toLowerCase().includes(q)
          || (a.name ?? "").toLowerCase().includes(q)
          || (a.serial_number ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => String(a.asset_tag ?? "").localeCompare(String(b.asset_tag ?? "")));
  }, [enrichedAssets, auditByAsset, auditAssetQuery]);

  const auditRows = useMemo(() => {
    const ids = Array.from(auditSelectedAssets);
    const out: any[] = [];
    for (const id of ids) {
      const a = allAssetMap[id];
      if (!a) continue;
      const assetLabel = `${a.asset_tag ?? ""} — ${a.name ?? ""}`.replace(/^ — | — $/g, "").trim() || "Asset";
      const list = (auditByAsset[id] ?? []).filter((r) =>
        (!fAudit.activity || r._activityCode === fAudit.activity) &&
        applyDate(r.created_at, fAudit.from, fAudit.to),
      );
      list.forEach((r, idx) => {
        out.push({
          asset: assetLabel,
          activity: `Activity ${idx + 1}: ${r._activityLabel}`,
          actor: userLabel(r.actor_user_id),
          created_at: r.created_at,
        });
      });
    }
    return out.filter((r) =>
      !fAudit.q
      || applyText(r.asset, fAudit.q)
      || applyText(r.activity, fAudit.q)
      || applyText(r.actor, fAudit.q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditSelectedAssets, auditByAsset, allAssetMap, fAudit, profileMap]);

  const auditReport: Report = {
    title: "Audit Trail Report",
    columns: [
      { header: "Asset", key: "asset" },
      { header: "Activity", key: "activity" },
      { header: "By", key: "actor" },
      { header: "Date & time", key: "created_at", isDateTime: true },
    ],
    rows: auditRows,
  };

  const allAuditAssetsSelected = auditAssetChoices.length > 0
    && auditAssetChoices.every((a: any) => auditSelectedAssets.has(a.id));
  const toggleAuditAsset = (id: string) => {
    setAuditSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllAuditAssets = () => {
    setAuditSelectedAssets((prev) => {
      if (allAuditAssetsSelected) {
        const next = new Set(prev);
        auditAssetChoices.forEach((a: any) => next.delete(a.id));
        return next;
      }
      const next = new Set(prev);
      auditAssetChoices.forEach((a: any) => next.add(a.id));
      return next;
    });
  };


  /* ----------- Branch / Dept / Condition (unchanged aggregates) ----------- */
  const branchReport: Report = {
    title: "Branch Report",
    columns: [
      { header: "Branch", key: "name" }, { header: "Code", key: "code" },
      { header: "Total assets", key: "total" }, { header: "In use", key: "in_use" },
      { header: "Under repair", key: "under_repair" }, { header: "Retired", key: "retired" },
      { header: "Total value", key: "value", isCurrency: true },
    ],
    rows: scopedBranches.map((b: any) => {
      const list = enrichedAssets.filter((a: any) => a.branch_id === b.id);
      return {
        name: b.name, code: b.code ?? "",
        total: list.length,
        in_use: list.filter((a: any) => a.status === "in_use").length,
        under_repair: list.filter((a: any) => a.status === "under_repair").length,
        retired: list.filter((a: any) => a.status === "retired").length,
        value: list.reduce((s: number, a: any) => s + Number(a.purchase_value ?? 0), 0),
      };
    }),
  };

  const deptMap: Record<string, number> = {};
  Object.values(currentAssignment).forEach((a: any) => {
    const k = a.department || "Unassigned";
    deptMap[k] = (deptMap[k] ?? 0) + 1;
  });
  const departmentReport: Report = {
    title: "Departmental Report",
    columns: [{ header: "Department", key: "department" }, { header: "Assets assigned", key: "count" }],
    rows: Object.entries(deptMap).map(([department, count]) => ({ department, count })),
  };

  const statusCounts = ["in_use", "in_storage", "under_repair", "retired", "missing", "disposed"].map((s) => ({
    name: s.replace("_", " "),
    value: enrichedAssets.filter((a: any) => a.status === s).length,
  })).filter((d) => d.value > 0);

  const branchStatusData = scopedBranches.map((b: any) => {
    const list = enrichedAssets.filter((a: any) => a.branch_id === b.id);
    return {
      name: b.name,
      in_use: list.filter((a: any) => a.status === "in_use").length,
      under_repair: list.filter((a: any) => a.status === "under_repair").length,
      retired: list.filter((a: any) => a.status === "retired").length,
      missing: list.filter((a: any) => a.status === "missing").length,
    };
  });

  if (loading) return null;
  if (!canView("reports")) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Filter, visualise and export operational reports.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex !h-auto min-h-9 w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="assigned">Assigned</TabsTrigger>
          <TabsTrigger value="disposals">Retire/Dispose</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
          <TabsTrigger value="gate-pass">Gate Passes</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="branch">Branch</TabsTrigger>
          <TabsTrigger value="department">Department</TabsTrigger>
          <TabsTrigger value="condition">Condition</TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="mt-4">
          <FilterBar defs={registerDefs} values={fRegister} onChange={setFRegister} />
          <ReportTable r={register} />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <FilterBar defs={movementDefs} values={fMove} onChange={setFMove} />
          <ReportTable r={movementReport} />
        </TabsContent>
        <TabsContent value="assigned" className="mt-4">
          <FilterBar defs={assignDefs} values={fAssign} onChange={setFAssign} />
          <ReportTable r={assignedReport} />
        </TabsContent>
        <TabsContent value="disposals" className="mt-4">
          <FilterBar defs={disposalDefs} values={fDisposal} onChange={setFDisposal} />
          <ReportTable r={disposalReport} />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          <FilterBar defs={maintenanceDefs} values={fMaint} onChange={setFMaint} />
          <ReportTable r={maintenanceReport} />
        </TabsContent>
        <TabsContent value="approvals" className="mt-4">
          <FilterBar defs={approvalDefs} values={fApprov} onChange={setFApprov} />
          <ReportTable r={approvalReport} />
        </TabsContent>
        <TabsContent value="verification" className="mt-4">
          <FilterBar defs={verificationDefs} values={fVerification} onChange={setFVerification} />
          <ReportTable r={verificationReport} />
        </TabsContent>
        <TabsContent value="depreciation" className="mt-4">
          <FilterBar defs={depreciationDefs} values={fDepreciation} onChange={setFDepreciation} />
          <ReportTable r={depreciationReport} />
        </TabsContent>
        <TabsContent value="gate-pass" className="mt-4">
          <FilterBar defs={gatePassDefs} values={fGatePass} onChange={setFGatePass} />
          <ReportTable r={gatePassReport} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTrailView showHeader={false} />
        </TabsContent>
        <TabsContent value="branch" className="mt-4"><ReportTable r={branchReport} /></TabsContent>
        <TabsContent value="department" className="mt-4"><ReportTable r={departmentReport} /></TabsContent>

        <TabsContent value="condition" className="mt-4">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Asset Condition Report</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">By status (overall)</p>
                {statusCounts.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No data.</p> : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {statusCounts.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Condition by branch</p>
                {branchStatusData.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No branches.</p> : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={branchStatusData}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="in_use" stackId="s" fill="hsl(142 71% 45%)" />
                        <Bar dataKey="under_repair" stackId="s" fill="hsl(38 92% 50%)" />
                        <Bar dataKey="retired" stackId="s" fill="hsl(220 9% 46%)" />
                        <Bar dataKey="missing" stackId="s" fill="hsl(0 84% 60%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportTable({ r }: { r: Report }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{r.title} <span className="ml-2 text-xs font-normal text-muted-foreground">({r.rows.length})</span></h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportPDF(r)}>
            <FileDown className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportXLSX(r)}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        {r.rows.length === 0 ? (
          <div className="py-12 text-center">
            <FileBarChart className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No data for this report.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                {r.columns.map((c) => <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">{c.header}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 align-top">
                  {r.columns.map((c) => {
                    const v = row[c.key];
                    if (c.isMultiline && Array.isArray(v)) {
                      return (
                        <td key={c.key} className="px-3 py-2 min-w-[16rem]">
                          {v.length === 0 ? "" : (
                            <ul className="space-y-1 list-disc pl-4">
                              {v.map((line: string, j: number) => (
                                <li key={j} className="leading-snug">{line}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    }
                    return <td key={c.key} className="px-3 py-2">{fmtColumn(row, c)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
