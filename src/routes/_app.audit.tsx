import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Download, FileText, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { exportReportXLSX, exportReportPDF } from "@/lib/depreciation-export";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

const friendlyAction = (r: any) => {
  const t = r.entity_type;
  const a = r.action as string;
  if (t === "assets") {
    if (a === "created") return "New asset added";
    if (a === "retired") return "Asset retired";
    if (a === "updated") return "Asset details updated";
    if (a === "deleted") return "Asset removed";
  }
  if (t === "asset_movements" && a === "created") return "Asset movement recorded";
  if (t === "asset_assignments" && a === "created") return "Custodian assigned";
  if (t === "asset_disposals") {
    if (a === "created") return "Retirement / disposal requested";
    if (a === "disposal_approved") return "Disposal approved";
    if (a === "disposal_rejected") return "Disposal rejected";
  }
  if (t === "approval_requests") {
    if (a === "created") return "Approval requested";
    if (a === "updated") return "Approval decided";
  }
  if (t === "branches" || t === "locations" || t === "categories") {
    if (a === "created") return `New ${t.slice(0, -1)} added`;
    if (a === "updated") return `${t.slice(0, -1)} updated`;
  }
  return a.replace(/_/g, " ");
};

function AuditPage() {
  const { canView, isAdmin } = useAuth();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [userId, setUserId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showCleared, setShowCleared] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-log", showCleared, from, to],
    queryFn: async () => {
      let qy = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000);
      if (!showCleared) qy = qy.is("cleared_at", null);
      if (from) qy = qy.gte("created_at", from);
      if (to) qy = qy.lte("created_at", to + "T23:59:59");
      return (await qy).data ?? [];
    },
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((p: any) => [p.id, p])),
    [profiles],
  );
  const userLabel = (id: string | null | undefined) => {
    if (!id) return "—";
    const p = profileMap[id as string];
    return p?.full_name || p?.email || "—";
  };

  const filtered = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (entityType !== "all" && r.entity_type !== entityType) return false;
      if (action !== "all" && r.action !== action) return false;
      if (userId !== "all" && r.actor_user_id !== userId) return false;
      if (q) {
        const actor = userLabel(r.actor_user_id);
        const hay = [r.entity_type, r.action, friendlyAction(r), actor, r.entity_id].join(" ").toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, entityType, action, userId, q, profileMap]);

  const actionOptions = useMemo(
    () => Array.from(new Set((rows as any[]).map((r) => r.action))).sort(),
    [rows],
  );

  if (!canView("audit")) return <Navigate to="/dashboard" />;

  const exportList = (kind: "xlsx" | "pdf") => {
    const headers = ["When", "Entity", "Action", "By", "Entity ID"];
    const data = filtered.map((r) => [
      new Date(r.created_at).toLocaleString(),
      r.entity_type,
      friendlyAction(r),
      userLabel(r.actor_user_id),
      r.entity_id ?? "—",
    ]);
    const title = "Audit trail";
    if (kind === "xlsx") exportReportXLSX(title, headers, data);
    else exportReportPDF(title, headers, data);
  };

  const openDetailPdf = (r: any) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Audit Log Entry", 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [["Field", "Value"]],
      body: [
        ["When", new Date(r.created_at).toLocaleString()],
        ["Entity type", r.entity_type ?? "—"],
        ["Action", friendlyAction(r)],
        ["Raw action", r.action ?? "—"],
        ["Entity ID", r.entity_id ?? "—"],
        ["Performed by", userLabel(r.actor_user_id)],
        ["User ID", r.actor_user_id ?? "—"],
        ["Archived", r.cleared_at ? new Date(r.cleared_at).toLocaleString() : "No"],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
    });

    const details = r.details ?? {};
    const before = details.before ?? null;
    const after = details.after ?? details;
    const flatten = (obj: any) => {
      if (!obj || typeof obj !== "object") return [];
      return Object.entries(obj).map(([k, v]) => [
        k,
        typeof v === "object" ? JSON.stringify(v) : String(v ?? "—"),
      ]);
    };

    if (before) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Before", 14, 14);
      autoTable(doc, { startY: 20, head: [["Field", "Value"]], body: flatten(before), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] } });
      doc.setFontSize(14);
      doc.text("After", 14, (doc as any).lastAutoTable.finalY + 10);
      autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 16, head: [["Field", "Value"]], body: flatten(after), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] } });
    } else if (after && Object.keys(after).length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Payload", 14, 14);
      autoTable(doc, { startY: 20, head: [["Field", "Value"]], body: flatten(after), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] } });
    }

    const filename = `audit_${r.entity_type}_${(r.entity_id ?? r.id).slice(0, 8)}.pdf`;
    // Open in new tab AND trigger save so user can view + download
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    doc.save(filename);
  };

  const clearAll = async () => {
    if (!confirm("Archive all currently visible audit entries? Audit history is preserved.")) return;
    const ids = filtered.map((r: any) => r.id);
    const { error } = await supabase.from("audit_log").update({ cleared_at: new Date().toISOString() }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Archived ${ids.length} entries`);
    qc.invalidateQueries({ queryKey: ["audit-log"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">Every create, update, approval, and retirement action across the system.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={clearAll} className="gap-2">
              <Trash2 className="h-4 w-4" /> Archive visible
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Search</Label>
              <Input placeholder="Search entity, action, user…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entity</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  <SelectItem value="assets">Assets</SelectItem>
                  <SelectItem value="asset_movements">Movements</SelectItem>
                  <SelectItem value="asset_disposals">Disposals</SelectItem>
                  <SelectItem value="asset_assignments">Assignments</SelectItem>
                  <SelectItem value="approval_requests">Approvals</SelectItem>
                  <SelectItem value="branches">Branches</SelectItem>
                  <SelectItem value="categories">Categories</SelectItem>
                  <SelectItem value="locations">Locations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All actions</SelectItem>
                  {actionOptions.map((a) => (
                    <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All users</SelectItem>
                  {(profiles as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => exportList("xlsx")}>
              <Download className="mr-1 h-3 w-3" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportList("pdf")}>
              <FileText className="mr-1 h-3 w-3" /> PDF
            </Button>
          </div>
        </div>
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Checkbox id="cleared" checked={showCleared} onCheckedChange={(v) => setShowCleared(!!v)} />
          <label htmlFor="cleared" className="cursor-pointer">Show archived entries</label>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} entr{filtered.length === 1 ? "y" : "ies"}</span>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <History className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No audit entries.</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs table-auto">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left">When</th>
                  <th className="px-2 py-1.5 text-left">Entity</th>
                  <th className="px-2 py-1.5 text-left">Action</th>
                  <th className="px-2 py-1.5 text-left">By</th>
                  <th className="px-2 py-1.5 text-left">Entity ID</th>
                  <th className="px-2 py-1.5 text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className={"border-t " + (r.cleared_at ? "opacity-50" : "")}>
                    <td className="px-2 py-1 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-2 py-1"><Badge variant="outline" className="capitalize text-[10px]">{r.entity_type}</Badge></td>
                    <td className="px-2 py-1">{friendlyAction(r)}</td>
                    <td className="px-2 py-1">{userLabel(r.actor_user_id)}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{r.entity_id ? String(r.entity_id).slice(0, 8) : "—"}</td>
                    <td className="px-2 py-1 text-right">
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2" onClick={() => openDetailPdf(r)}>
                        <Eye className="h-3 w-3" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// keep XLSX referenced so build does not tree-shake when needed
void XLSX;
