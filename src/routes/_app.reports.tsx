import { useState } from "react";
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

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type Column = { header: string; key: string };
type Report = { title: string; columns: Column[]; rows: any[] };

function exportPDF(r: Report) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(r.title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [r.columns.map((c) => c.header)],
    body: r.rows.map((row) => r.columns.map((c) => fmt(row[c.key]))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(`${r.title.replace(/\s+/g, "_")}.pdf`);
}
function exportXLSX(r: Report) {
  const data = r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c.header, fmt(row[c.key])])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, r.title.slice(0, 30));
  XLSX.writeFile(wb, `${r.title.replace(/\s+/g, "_")}.xlsx`);
}
function fmt(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ReportsPage() {
  const [tab, setTab] = useState("register");

  // Data sources
  const { data: assets = [] } = useQuery({
    queryKey: ["report-assets"],
    queryFn: async () => (await supabase.from("assets")
      .select("*, categories(name), locations(name)")
      .order("asset_tag")).data ?? [],
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["report-assignments"],
    queryFn: async () => (await supabase.from("asset_assignments")
      .select("*, assets(asset_tag, name)")
      .order("assignment_date", { ascending: false })).data ?? [],
  });
  const { data: movements = [] } = useQuery({
    queryKey: ["report-movements"],
    queryFn: async () => (await supabase.from("asset_movements")
      .select("*, assets(asset_tag, name), from:from_location_id(name), to:to_location_id(name)")
      .order("moved_at", { ascending: false })).data ?? [],
  });
  const { data: disposals = [] } = useQuery({
    queryKey: ["report-disposals"],
    queryFn: async () => (await supabase.from("asset_disposals")
      .select("*, assets(asset_tag, name)")
      .order("disposal_date", { ascending: false })).data ?? [],
  });

  // Build report definitions
  const register: Report = {
    title: "Fixed Asset Register",
    columns: [
      { header: "Tag", key: "asset_tag" },
      { header: "Name", key: "name" },
      { header: "Category", key: "category" },
      { header: "Location", key: "location" },
      { header: "Status", key: "status" },
      { header: "Purchase Date", key: "purchase_date" },
      { header: "Purchase Value", key: "purchase_value" },
    ],
    rows: assets.map((a: any) => ({
      ...a,
      category: a.categories?.name ?? "",
      location: a.locations?.name ?? "",
    })),
  };
  const movementReport: Report = {
    title: "Asset Movement Report",
    columns: [
      { header: "Tag", key: "tag" },
      { header: "Asset", key: "name" },
      { header: "From", key: "from_name" },
      { header: "To", key: "to_name" },
      { header: "Date", key: "moved_at" },
      { header: "Reason", key: "reason" },
    ],
    rows: movements.map((m: any) => ({
      tag: m.assets?.asset_tag, name: m.assets?.name,
      from_name: m.from?.name ?? "", to_name: m.to?.name ?? "",
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
      { header: "Assigned", key: "assignment_date" },
      { header: "Return", key: "return_date" },
    ],
    rows: assignments.map((a: any) => ({
      tag: a.assets?.asset_tag, name: a.assets?.name,
      assigned_to_name: a.assigned_to_name ?? "", department: a.department ?? "",
      assignment_date: a.assignment_date, return_date: a.return_date ?? "",
    })),
  };
  const disposalReport: Report = {
    title: "Disposal Report",
    columns: [
      { header: "Tag", key: "tag" },
      { header: "Asset", key: "name" },
      { header: "Reason", key: "disposal_reason" },
      { header: "Date", key: "disposal_date" },
      { header: "Value", key: "disposal_value" },
      { header: "Approval", key: "approval_notes" },
    ],
    rows: disposals.map((d: any) => ({
      tag: d.assets?.asset_tag, name: d.assets?.name,
      disposal_reason: d.disposal_reason, disposal_date: d.disposal_date,
      disposal_value: d.disposal_value ?? "", approval_notes: d.approval_notes ?? "",
    })),
  };
  const maintenanceReport: Report = {
    title: "Maintenance History",
    columns: [
      { header: "Tag", key: "asset_tag" },
      { header: "Name", key: "name" },
      { header: "Status", key: "status" },
      { header: "Location", key: "location" },
    ],
    rows: assets.filter((a: any) => a.status === "under_repair" || a.status === "retired")
      .map((a: any) => ({ ...a, location: a.locations?.name ?? "" })),
  };

  const reports: Record<string, Report> = {
    register, movements: movementReport, assigned: assignedReport,
    disposals: disposalReport, maintenance: maintenanceReport,
  };
  const current = reports[tab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and export operational reports.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="assigned">Assigned</TabsTrigger>
          <TabsTrigger value="disposals">Disposals</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        {Object.keys(reports).map((key) => (
          <TabsContent key={key} value={key}>
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{reports[key].title}</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportPDF(reports[key])}>
                    <FileDown className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportXLSX(reports[key])}>
                    <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                {current.rows.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileBarChart className="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <p className="mt-3 text-sm text-muted-foreground">No data for this report yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        {current.columns.map((c) => <th key={c.key} className="px-3 py-2 font-medium">{c.header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {current.rows.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {current.columns.map((c) => (
                            <td key={c.key} className="px-3 py-2">{fmt(r[c.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
