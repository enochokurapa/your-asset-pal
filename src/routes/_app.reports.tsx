import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileBarChart, FileDown, FileSpreadsheet } from "lucide-react";
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

function ReportsPage() {
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

  const catMap = useMemo(() => Object.fromEntries(categories.map((c: any) => [c.id, c])), [categories]);
  const locMap = useMemo(() => Object.fromEntries(locationsAll.map((l: any) => [l.id, l])), [locationsAll]);

  // Build current-assignment lookup (most recent open assignment per asset)
  const currentAssignment: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    assignments.forEach((a: any) => {
      if (!map[a.asset_id]) map[a.asset_id] = a;
    });
    return map;
  }, [assignments]);

  const enrichedAssets = useMemo(() => assets.map((a: any) => {
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
  }), [assets, catMap, locMap, currentAssignment]);

  const register: Report = {
    title: "Fixed Asset Register",
    columns: [
      { header: "Tag", key: "asset_tag" },
      { header: "Serial #", key: "serial_number" },
      { header: "Name", key: "name" },
      { header: "Description", key: "description" },
      { header: "Category", key: "category" },
      { header: "Sub-category", key: "sub_category" },
      { header: "Branch", key: "branch" },
      { header: "Location", key: "location" },
      { header: "Sub-location", key: "sub_location" },
      { header: "Assigned to", key: "assigned_to" },
      { header: "Department", key: "department" },
      { header: "Status", key: "status" },
      { header: "Purchase Date", key: "purchase_date" },
      { header: "Purchase Value", key: "purchase_value", isCurrency: true },
    ],
    rows: enrichedAssets,
  };

  const movementReport: Report = {
    title: "Asset Movement Report",
    columns: [
      { header: "Tag", key: "tag" },
      { header: "Asset", key: "name" },
      { header: "From location", key: "from_loc" },
      { header: "To location", key: "to_loc" },
      { header: "From branch", key: "from_branch" },
      { header: "To branch", key: "to_branch" },
      { header: "From person", key: "from_user" },
      { header: "To person", key: "to_user" },
      { header: "Type", key: "transfer_type" },
      { header: "Date", key: "moved_at" },
      { header: "Reason", key: "reason" },
    ],
    rows: movements.map((m: any) => ({
      tag: m.assets?.asset_tag, name: m.assets?.name,
      from_loc: m.from?.name ?? "", to_loc: m.to?.name ?? "",
      from_branch: m.fromBranch?.name ?? "", to_branch: m.toBranch?.name ?? "",
      from_user: m.from_user ?? "", to_user: m.to_user ?? "",
      transfer_type: m.transfer_type ?? "internal",
      moved_at: m.moved_at, reason: m.reason ?? "",
    })),
  };

  const assignedReport: Report = {
    title: "Assigned Assets Report",
    columns: [
      { header: "Tag", key: "tag" },
      { header: "Asset", key: "name" },
      { header: "Employee", key: "assigned_to_name" },
      { header: "Department", key: "department" },
      { header: "Branch", key: "branch" },
      { header: "Assigned", key: "assignment_date" },
      { header: "Return", key: "return_date" },
    ],
    rows: assignments.map((a: any) => ({
      tag: a.assets?.asset_tag, name: a.assets?.name,
      assigned_to_name: a.assigned_to_name ?? "", department: a.department ?? "",
      branch: a.branches?.name ?? "",
      assignment_date: a.assignment_date, return_date: a.return_date ?? "",
    })),
  };

  const disposalReport: Report = {
    title: "Retirement & Disposal Report",
    columns: [
      { header: "Tag", key: "tag" },
      { header: "Asset", key: "name" },
      { header: "Type", key: "type" },
      { header: "Reason", key: "disposal_reason" },
      { header: "Date", key: "disposal_date" },
      { header: "Value", key: "disposal_value", isCurrency: true },
      { header: "Status", key: "status" },
      { header: "Approval notes", key: "approval_notes" },
    ],
    rows: disposals.map((d: any) => ({
      tag: d.assets?.asset_tag, name: d.assets?.name,
      type: d.retirement_reason ? "Retirement" : "Disposal",
      disposal_reason: d.disposal_reason, disposal_date: d.disposal_date,
      disposal_value: d.disposal_value, status: d.status ?? "pending",
      approval_notes: d.approval_notes ?? "",
    })),
  };

  const maintenanceReport: Report = {
    title: "Maintenance History",
    columns: [
      { header: "Tag", key: "asset_tag" },
      { header: "Name", key: "name" },
      { header: "Description", key: "description" },
      { header: "Status", key: "status" },
      { header: "Branch", key: "branch" },
      { header: "Location", key: "location" },
    ],
    rows: enrichedAssets.filter((a: any) => a.status === "under_repair" || a.status === "retired"),
  };

  // Branch report aggregation
  const branchReport: Report = {
    title: "Branch Report",
    columns: [
      { header: "Branch", key: "name" },
      { header: "Code", key: "code" },
      { header: "Total assets", key: "total" },
      { header: "In use", key: "in_use" },
      { header: "Under repair", key: "under_repair" },
      { header: "Retired", key: "retired" },
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

  // Departmental aggregation (from current assignments)
  const deptMap: Record<string, number> = {};
  Object.values(currentAssignment).forEach((a: any) => {
    const k = a.department || "Unassigned";
    deptMap[k] = (deptMap[k] ?? 0) + 1;
  });
  const departmentReport: Report = {
    title: "Departmental Report",
    columns: [
      { header: "Department", key: "department" },
      { header: "Assets assigned", key: "count" },
    ],
    rows: Object.entries(deptMap).map(([department, count]) => ({ department, count })),
  };

  // Condition / status counts for charts
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

  const reports: Record<string, Report> = {
    register, movements: movementReport, assigned: assignedReport,
    disposals: disposalReport, maintenance: maintenanceReport,
    branch: branchReport, department: departmentReport,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate, visualise and export operational reports.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="assigned">Assigned</TabsTrigger>
          <TabsTrigger value="disposals">Retire/Dispose</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="branch">Branch</TabsTrigger>
          <TabsTrigger value="department">Department</TabsTrigger>
          <TabsTrigger value="condition">Condition</TabsTrigger>
        </TabsList>

        {Object.keys(reports).map((key) => (
          <TabsContent key={key} value={key}>
            <ReportTable r={reports[key]} />
          </TabsContent>
        ))}

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
        <h2 className="text-lg font-semibold">{r.title}</h2>
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
            <p className="mt-3 text-sm text-muted-foreground">No data for this report yet.</p>
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
