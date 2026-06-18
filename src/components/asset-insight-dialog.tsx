import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import autoTable from "jspdf-autotable";
import { formatUGX } from "@/lib/utils";
import {
  netBookValue, periodMonths, type DepreciationFrequency,
} from "@/lib/depreciation";
import {
  loadTemplate, createBrandedPdf, saveBranded, tableHeadFill,
} from "@/lib/pdf-template";

type Focus = "missed" | "nbv" | "accumulated" | "audit" | "general";

export function AssetInsightDialog({
  assetId, focus = "general", open, onOpenChange,
}: {
  assetId: string | null;
  focus?: Focus;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: asset } = useQuery({
    enabled: !!assetId && open,
    queryKey: ["asset-insight", assetId],
    queryFn: async () =>
      (await supabase.from("assets").select("*, categories(name), branches(name)").eq("id", assetId!).single()).data,
  });
  const { data: entries = [] } = useQuery({
    enabled: !!assetId && open,
    queryKey: ["asset-insight-entries", assetId],
    queryFn: async () =>
      (await supabase.from("depreciation_entries" as any)
        .select("*").eq("asset_id", assetId!).order("period_end", { ascending: true })).data ?? [],
  });
  const { data: overrides = [] } = useQuery({
    enabled: !!assetId && open,
    queryKey: ["asset-insight-overrides", assetId],
    queryFn: async () =>
      (await supabase.from("depreciation_overrides" as any)
        .select("*").eq("asset_id", assetId!).order("created_at", { ascending: false })).data ?? [],
  });

  const missing = useMemo(() => {
    if (!asset?.depreciation_start_date || !asset?.depreciation_method) return [];
    const f: DepreciationFrequency = (asset.depreciation_frequency ?? "monthly") as DepreciationFrequency;
    const months = periodMonths(f);
    const start = new Date(asset.depreciation_start_date);
    const today = new Date();
    const expected: { periodEnd: string; periodStart: string }[] = [];
    let cur = new Date(start);
    while (cur < today) {
      const ps = new Date(cur);
      cur.setMonth(cur.getMonth() + months);
      const pe = new Date(cur); pe.setDate(pe.getDate() - 1);
      if (pe > today) break;
      expected.push({ periodStart: ps.toISOString().slice(0, 10), periodEnd: pe.toISOString().slice(0, 10) });
    }
    const have = new Set((entries as any[]).map((e) => e.period_end));
    return expected.filter((p) => !have.has(p.periodEnd));
  }, [asset, entries]);

  const nbv = asset ? netBookValue(asset as any) : 0;

  const downloadPdf = async () => {
    if (!asset) return;
    const template = await loadTemplate();
    const focusLabel = {
      missed: "Missed Depreciation Periods",
      nbv: "Net Book Value Insight",
      accumulated: "Accumulated Depreciation Insight",
      audit: "Audit Insight",
      general: "Asset Depreciation Insight",
    }[focus];
    const { doc, startY } = createBrandedPdf({
      template, orientation: "portrait",
      title: focusLabel,
      subtitle: `${asset.asset_tag} — ${asset.name}`,
    });

    autoTable(doc, {
      startY,
      head: [["Field", "Value"]],
      body: [
        ["Category", asset.categories?.name ?? "—"],
        ["Branch", asset.branches?.name ?? "—"],
        ["Method", asset.depreciation_method ?? "—"],
        ["Frequency", asset.depreciation_frequency ?? "—"],
        ["Useful life (months)", String(asset.useful_life_months ?? "—")],
        ["Start date", asset.depreciation_start_date ?? "—"],
        ["Last run", asset.last_depreciation_date ?? "Never"],
        ["Purchase value", formatUGX(asset.purchase_value)],
        ["Residual value", formatUGX(asset.residual_value)],
        ["Accumulated", formatUGX(asset.accumulated_depreciation)],
        ["Impairment", formatUGX(asset.impairment_amount)],
        ["Net book value", formatUGX(nbv)],
      ],
      styles: { fontSize: 9, font: template.font_family },
      headStyles: { fillColor: tableHeadFill(template) },
      margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
    });

    if (missing.length > 0) {
      autoTable(doc, {
        head: [["Missed period start", "Missed period end"]],
        body: missing.map((m) => [m.periodStart, m.periodEnd]),
        styles: { fontSize: 9, font: template.font_family },
        headStyles: { fillColor: tableHeadFill(template) },
        margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
      });
    }

    if (entries.length > 0) {
      autoTable(doc, {
        head: [["Period start", "Period end", "Opening", "Depreciation", "Accumulated", "Closing"]],
        body: (entries as any[]).map((e) => [
          e.period_start, e.period_end,
          formatUGX(e.opening_value), formatUGX(e.depreciation_amount),
          formatUGX(e.accumulated_after), formatUGX(e.closing_value),
        ]),
        styles: { fontSize: 8, font: template.font_family },
        headStyles: { fillColor: tableHeadFill(template) },
        margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
      });
    }

    if (overrides.length > 0) {
      autoTable(doc, {
        head: [["Date", "Type", "Amount", "Reason"]],
        body: (overrides as any[]).map((o) => [
          o.effective_date ?? new Date(o.created_at).toISOString().slice(0, 10),
          o.type, formatUGX(o.amount), o.reason ?? "—",
        ]),
        styles: { fontSize: 8, font: template.font_family },
        headStyles: { fillColor: tableHeadFill(template) },
        margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
      });
    }

    saveBranded(doc, template, `${asset.asset_tag}-${focus}-insight.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {asset ? `${asset.asset_tag} — ${asset.name}` : "Asset insight"}
          </DialogTitle>
          <DialogDescription>
            {focus === "missed" && "Missed depreciation periods and complete run log for this asset."}
            {focus === "nbv" && "Net book value breakdown and depreciation history."}
            {focus === "accumulated" && "Accumulated depreciation breakdown and run history."}
            {focus === "audit" && "Audit trail entries for this asset."}
            {focus === "general" && "Depreciation insight for this asset."}
          </DialogDescription>
        </DialogHeader>

        {!asset ? (
          <p className="py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Purchase" value={formatUGX(asset.purchase_value)} />
              <Tile label="Accumulated" value={formatUGX(asset.accumulated_depreciation)} />
              <Tile label="Impairment" value={formatUGX(asset.impairment_amount)} />
              <Tile label="NBV" value={formatUGX(nbv)} highlight />
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="grid gap-1 sm:grid-cols-2">
                <p><span className="text-muted-foreground">Method:</span> {asset.depreciation_method ?? "—"}</p>
                <p><span className="text-muted-foreground">Frequency:</span> {asset.depreciation_frequency ?? "—"}</p>
                <p><span className="text-muted-foreground">Useful life:</span> {asset.useful_life_months ?? "—"} months</p>
                <p><span className="text-muted-foreground">Start:</span> {asset.depreciation_start_date ?? "—"}</p>
                <p><span className="text-muted-foreground">Last run:</span> {asset.last_depreciation_date ?? "Never"}</p>
                <p><span className="text-muted-foreground">Branch:</span> {asset.branches?.name ?? "—"}</p>
              </div>
            </div>

            {missing.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">
                  Missed periods <Badge variant="destructive" className="ml-1">{missing.length}</Badge>
                </p>
                <div className="max-h-40 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr><th className="px-2 py-1 text-left">Period start</th><th className="px-2 py-1 text-left">Period end</th></tr>
                    </thead>
                    <tbody>
                      {missing.map((m, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{m.periodStart}</td>
                          <td className="px-2 py-1">{m.periodEnd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Run log ({entries.length})</p>
              <div className="max-h-64 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Period</th>
                      <th className="px-2 py-1 text-right">Opening</th>
                      <th className="px-2 py-1 text-right">Depreciation</th>
                      <th className="px-2 py-1 text-right">Accumulated</th>
                      <th className="px-2 py-1 text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">No posted entries.</td></tr>
                    ) : (entries as any[]).map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-2 py-1">{e.period_start} → {e.period_end}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatUGX(e.opening_value)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatUGX(e.depreciation_amount)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatUGX(e.accumulated_after)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatUGX(e.closing_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {overrides.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Overrides / adjustments ({overrides.length})</p>
                <ul className="space-y-1 text-xs">
                  {(overrides as any[]).map((o) => (
                    <li key={o.id} className="flex justify-between border-b py-1">
                      <span><Badge variant="outline" className="mr-2 capitalize">{o.type.replace("_", " ")}</Badge>{o.reason ?? "—"}</span>
                      <span className="tabular-nums">{formatUGX(o.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={downloadPdf}>
                <FileText className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
