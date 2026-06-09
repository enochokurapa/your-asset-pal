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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatUGX } from "@/lib/utils";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type Column = { header: string; key: string; isCurrency?: boolean };
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
function exportPDF(r: Report) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(r.title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [r.columns.map((c) => c.header)],
    body: r.rows.map((row) => r.columns.map((c) => fmtCell(row[c.key], c.isCurrency))),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(`${r.title.replace(/\s+/g, "_")}.pdf`);
}
function exportXLSX(r: Report) {
  const data = r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c.header, fmtCell(row[c.key], c.isCurrency)])));
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
      .select("*, assets(asset_tag, name)")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p: any) => [p.id, p])), [profiles]);

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
    () => (approvals as any[]).filter((p) => !p.asset_id || visibleAssetIds.has(p.asset_id)),
    [approvals, visibleAssetIds],
  );
  const scopedBranches = useMemo(
    () => (branches as any[]).filter((b) => canSeeBranch(b.id)),
    [branches, canSeeBranch],
  );

  // Shared option lists
  const branchOpts = branches.map((b: any) => ({ value: b.id, label: b.name }));
  const categoryOpts = categories.filter((c: any) => !c.parent_id).map((c: any) => ({ value: c.id, label: c.name }));
  const statusOpts = ["in_use", "in_storage", "under_repair", "retired", "missing", "disposed"]
    .map((s) => ({ value: s, label: s.replace("_", " ") }));
  const movementTypeOpts = [{ value: "internal", label: "Internal" }, { value: "external", label: "External" }];
  const approvalKindOpts = ["movement", "retirement", "disposal", "maintenance", "reactivation", "set_for_disposal"]
    .map((k) => ({ value: k, label: k.replace(/_/g, " ") }));
  const approvalStatusOpts = ["pending", "approved", "rejected"].map((s) => ({ value: s, label: s }));
  const priorityOpts = ["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p }));

  /* ----------- Filters state per tab ----------- */
  const [fRegister, setFRegister] = useState<Record<string, string>>({});
  const [fMove, setFMove] = useState<Record<string, string>>({});
  const [fAssign, setFAssign] = useState<Record<string, string>>({});
  const [fDisposal, setFDisposal] = useState<Record<string, string>>({});
  const [fMaint, setFMaint] = useState<Record<string, string>>({});
  const [fApprov, setFApprov] = useState<Record<string, string>>({});

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
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];
  const movementRows = movements.filter((m: any) =>
    (!fMove.transfer_type || (m.transfer_type ?? "internal") === fMove.transfer_type) &&
    (!fMove.from_branch_id || m.from_branch_id === fMove.from_branch_id) &&
    (!fMove.to_branch_id || m.to_branch_id === fMove.to_branch_id) &&
    applyDate(m.moved_at, fMove.from, fMove.to) &&
    (!fMove.q || applyText(m.assets?.asset_tag, fMove.q) || applyText(m.assets?.name, fMove.q) || applyText(m.reason, fMove.q)),
  ).map((m: any) => ({
    tag: m.assets?.asset_tag, name: m.assets?.name,
    from_loc: m.from?.name ?? "", to_loc: m.to?.name ?? "",
    from_branch: m.fromBranch?.name ?? "", to_branch: m.toBranch?.name ?? "",
    from_user: m.from_user ?? "", to_user: m.to_user ?? "",
    transfer_type: m.transfer_type ?? "internal",
    moved_at: m.moved_at, reason: m.reason ?? "",
  }));
  const movementReport: Report = {
    title: "Asset Movement Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "From location", key: "from_loc" }, { header: "To location", key: "to_loc" },
      { header: "From branch", key: "from_branch" }, { header: "To branch", key: "to_branch" },
      { header: "From person", key: "from_user" }, { header: "To person", key: "to_user" },
      { header: "Type", key: "transfer_type" }, { header: "Date", key: "moved_at" },
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
  const assignRows = assignments.filter((a: any) =>
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
    { key: "status", label: "Status", type: "select", options: [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }] },
    { key: "from", label: "From date", type: "date" },
    { key: "to", label: "To date", type: "date" },
  ];
  const disposalRows = disposals.map((d: any) => ({
    tag: d.assets?.asset_tag, name: d.assets?.name,
    type: d.retirement_reason ? "Retirement" : "Disposal",
    disposal_reason: d.disposal_reason, disposal_date: d.disposal_date,
    disposal_value: d.disposal_value, status: d.status ?? "pending",
    approval_notes: d.approval_notes ?? "",
  })).filter((r: any) =>
    (!fDisposal.type || r.type === fDisposal.type) &&
    (!fDisposal.status || r.status === fDisposal.status) &&
    applyDate(r.disposal_date, fDisposal.from, fDisposal.to) &&
    (!fDisposal.q || applyText(r.tag, fDisposal.q) || applyText(r.name, fDisposal.q) || applyText(r.disposal_reason, fDisposal.q)),
  );
  const disposalReport: Report = {
    title: "Retirement & Disposal Report",
    columns: [
      { header: "Tag", key: "tag" }, { header: "Asset", key: "name" },
      { header: "Type", key: "type" }, { header: "Reason", key: "disposal_reason" },
      { header: "Date", key: "disposal_date" }, { header: "Value", key: "disposal_value", isCurrency: true },
      { header: "Status", key: "status" }, { header: "Approval notes", key: "approval_notes" },
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
  const maintenanceRows = approvals.filter((r: any) => r.kind === "maintenance").map((r: any) => {
    const p = r.payload ?? {};
    const requester = profileMap[r.requested_by];
    const approver = r.approver_id ? profileMap[r.approver_id] : null;
    return {
      tag: r.assets?.asset_tag, name: r.assets?.name,
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
      { header: "Issue", key: "issue" }, { header: "Priority", key: "priority" },
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
  const approvalRows = approvals.map((r: any) => {
    const requester = profileMap[r.requested_by];
    const approver = r.approver_id ? profileMap[r.approver_id] : null;
    return {
      kind: r.kind, status: r.status,
      tag: r.assets?.asset_tag, name: r.assets?.name,
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
      { header: "Reason", key: "reason" }, { header: "Requested by", key: "requested_by" },
      { header: "Approver", key: "approver" }, { header: "Requested", key: "created_at" },
      { header: "Decided", key: "decided_at" },
    ],
    rows: approvalRows,
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
    rows: branches.map((b: any) => {
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

  const branchStatusData = branches.map((b: any) => {
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
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="assigned">Assigned</TabsTrigger>
          <TabsTrigger value="disposals">Retire/Dispose</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="branch">Branch</TabsTrigger>
          <TabsTrigger value="department">Department</TabsTrigger>
          <TabsTrigger value="condition">Condition</TabsTrigger>
        </TabsList>

        <TabsContent value="register">
          <FilterBar defs={registerDefs} values={fRegister} onChange={setFRegister} />
          <ReportTable r={register} />
        </TabsContent>
        <TabsContent value="movements">
          <FilterBar defs={movementDefs} values={fMove} onChange={setFMove} />
          <ReportTable r={movementReport} />
        </TabsContent>
        <TabsContent value="assigned">
          <FilterBar defs={assignDefs} values={fAssign} onChange={setFAssign} />
          <ReportTable r={assignedReport} />
        </TabsContent>
        <TabsContent value="disposals">
          <FilterBar defs={disposalDefs} values={fDisposal} onChange={setFDisposal} />
          <ReportTable r={disposalReport} />
        </TabsContent>
        <TabsContent value="maintenance">
          <FilterBar defs={maintenanceDefs} values={fMaint} onChange={setFMaint} />
          <ReportTable r={maintenanceReport} />
        </TabsContent>
        <TabsContent value="approvals">
          <FilterBar defs={approvalDefs} values={fApprov} onChange={setFApprov} />
          <ReportTable r={approvalReport} />
        </TabsContent>
        <TabsContent value="branch"><ReportTable r={branchReport} /></TabsContent>
        <TabsContent value="department"><ReportTable r={departmentReport} /></TabsContent>

        <TabsContent value="condition">
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
                <tr key={i} className="border-b last:border-0">
                  {r.columns.map((c) => (
                    <td key={c.key} className="px-3 py-2">{fmtCell(row[c.key], c.isCurrency)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
