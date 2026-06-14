import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, Search, ArrowLeft } from "lucide-react";
import { formatUGX } from "@/lib/utils";
import {
  exportAssetsPDF, exportAssetsXLSX,
  exportAssetDetailPDF, exportAssetDetailXLSX,
} from "@/lib/asset-export";
import { AssetDetailTabs } from "@/components/asset-detail-tabs";

export type TileFilter =
  | { kind: "all" }
  | { kind: "active" }
  | { kind: "status"; status: string }
  | { kind: "for_disposal" }
  | { kind: "pending_retirement" }
  | { kind: "pending_repair" };

export function TileAssetsDialog({
  open, onOpenChange, title, filter, branchId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  filter: TileFilter;
  branchId?: string | null;
}) {
  const { canSeeBranch } = useAuth();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any>(null);


  const { data: assets = [], isLoading } = useQuery({
    enabled: open,
    queryKey: ["tile-assets"],
    queryFn: async () => {
      const [{ data: a }, { data: assigns }, { data: pendings }] = await Promise.all([
        supabase.from("assets").select("*, categories(name), locations(name), branches(name,code)").order("created_at", { ascending: false }),
        supabase.from("asset_assignments").select("asset_id, assigned_to_name, department, assignment_date").order("assignment_date", { ascending: false }),
        supabase.from("approval_requests").select("asset_id, kind, status").eq("status", "pending"),
      ]);
      const cur: Record<string, any> = {};
      (assigns ?? []).forEach((x: any) => { if (!cur[x.asset_id]) cur[x.asset_id] = x; });
      const pendingRet = new Set((pendings ?? []).filter((p: any) => p.kind === "retirement").map((p: any) => p.asset_id));
      const pendingRep = new Set((pendings ?? []).filter((p: any) => p.kind === "maintenance").map((p: any) => p.asset_id));
      return (a ?? []).map((row: any) => ({
        ...row,
        custodian: cur[row.id]?.assigned_to_name ?? "",
        department: cur[row.id]?.department ?? "",
        condition: (row.status ?? "").replace(/_/g, " "),
        _pending_retirement: pendingRet.has(row.id),
        _pending_repair: pendingRep.has(row.id),
        _parked: row.set_for_disposal || pendingRet.has(row.id) || pendingRep.has(row.id),
      }));
    },
  });

  const filtered = useMemo(() => {
    const inactive = new Set(["disposed", "retired", "under_repair", "missing"]);
    let list = (assets as any[]).filter((a) => canSeeBranch(a.branch_id));
    if (branchId) list = list.filter((a) => a.branch_id === branchId);

    if (filter.kind === "active") list = list.filter((a) => !inactive.has(a.status) && !a._parked);
    else if (filter.kind === "status") list = list.filter((a) => a.status === filter.status && !a._parked);
    else if (filter.kind === "for_disposal") list = list.filter((a) => a.set_for_disposal);
    else if (filter.kind === "pending_retirement") list = list.filter((a) => a._pending_retirement);
    else if (filter.kind === "pending_repair") list = list.filter((a) => a._pending_repair);
    if (q) {
      const n = q.toLowerCase();
      list = list.filter((a) =>
        [a.name, a.asset_tag, a.serial_number, a.custodian, a.department, a.condition, a.branches?.name, a.categories?.name]
          .some((v) => (v ?? "").toString().toLowerCase().includes(n)),
      );
    }
    return list;
  }, [assets, filter, q, canSeeBranch]);

  const handleClose = (v: boolean) => {
    if (!v) setSelected(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        {!selected ? (
          <>
            <DialogHeader>
              <DialogTitle>{title} — Report</DialogTitle>
              <DialogDescription>
                {isLoading
                  ? "Loading…"
                  : `Generated ${new Date().toLocaleString()} · ${filtered.length} asset(s). Click a row for details.`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => exportAssetsXLSX(title, filtered)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => exportAssetsPDF(title, filtered)}>
                <FileText className="mr-2 h-4 w-4" /> PDF
              </Button>
            </div>

            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Tag</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Condition</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Custodian</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} onClick={() => setSelected(a)}
                      className="cursor-pointer border-t hover:bg-accent">
                      <td className="px-3 py-2 font-mono text-xs">{a.asset_tag}</td>
                      <td className="px-3 py-2">{a.name}</td>
                      <td className="px-3 py-2"><Badge variant="secondary">{a.condition}</Badge></td>
                      <td className="px-3 py-2">{a.department || "—"}</td>
                      <td className="px-3 py-2">{a.branches?.name ?? ""}</td>
                      <td className="px-3 py-2">{a.custodian || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.purchase_value ? formatUGX(a.purchase_value) : "—"}</td>
                    </tr>
                  ))}
                  {!filtered.length && !isLoading && (
                    <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No assets.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                  <DialogTitle className="!mt-0">{selected.name}</DialogTitle>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportAssetDetailXLSX(selected)}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportAssetDetailPDF(selected)}>
                    <Download className="mr-2 h-4 w-4" /> PDF
                  </Button>
                </div>
              </div>
              <DialogDescription className="font-mono text-xs">{selected.asset_tag}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <Row k="Status" v={(selected.status ?? "").replace(/_/g, " ")} />
              <Row k="Serial" v={selected.serial_number} />
              <Row k="Category" v={selected.categories?.name} />
              <Row k="Location" v={selected.locations?.name} />
              <Row k="Branch" v={selected.branches?.name} />
              <Row k="Custodian" v={selected.custodian} />
              <Row k="Department" v={selected.department} />
              <Row k="Purchase date" v={selected.purchase_date} />
              <Row k="Purchase value" v={selected.purchase_value ? formatUGX(selected.purchase_value) : ""} />
              <Row k="Set for disposal" v={selected.set_for_disposal ? "Yes" : "No"} />
            </div>
            {selected.description && (
              <div className="rounded border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Description</div>
                {selected.description}
              </div>
            )}

            <AssetDetailTabs assetId={selected.id} defaultTab="activity" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between gap-3 rounded border bg-card px-3 py-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v || "—"}</span>
    </div>
  );
}
