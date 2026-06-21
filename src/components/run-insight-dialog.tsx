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
  loadTemplate, createBrandedPdf, saveBranded, tableHeadFill,
} from "@/lib/pdf-template";

export function RunInsightDialog({
  run, open, onOpenChange,
}: {
  run: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: entries = [] } = useQuery({
    enabled: !!run && open,
    queryKey: ["run-insight-entries", run?.id],
    queryFn: async () =>
      (await supabase.from("depreciation_entries" as any)
        .select("*, assets(asset_tag,name)")
        .eq("run_id", run.id)
        .order("period_end", { ascending: true })).data ?? [],
  });

  const downloadPdf = async () => {
    if (!run) return;
    const template = await loadTemplate();
    const { doc, startY } = createBrandedPdf({
      template, orientation: "landscape",
      title: "Depreciation Run Details",
      subtitle: `${run.period_start} → ${run.period_end} · ${run.run_type} · ${run.status}`,
    });
    autoTable(doc, {
      startY,
      head: [["Field", "Value"]],
      body: [
        ["Period", `${run.period_start} → ${run.period_end}`],
        ["Type", run.run_type],
        ["Status", run.status],
        ["Asset count", String(run.asset_count ?? 0)],
        ["Total", formatUGX(run.total_amount)],
        ["Notes", run.notes ?? "—"],
        ["Run at", new Date(run.created_at).toLocaleString()],
      ],
      styles: { fontSize: 9, font: template.font_family },
      headStyles: { fillColor: tableHeadFill(template) },
      margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
    });
    autoTable(doc, {
      head: [["Tag", "Asset", "Opening", "Depreciation", "Accumulated", "Closing"]],
      body: (entries as any[]).map((e) => [
        e.assets?.asset_tag ?? "—",
        e.assets?.name ?? "—",
        formatUGX(e.opening_value),
        formatUGX(e.depreciation_amount),
        formatUGX(e.accumulated_after),
        formatUGX(e.closing_value),
      ]),
      styles: { fontSize: 8, font: template.font_family },
      headStyles: { fillColor: tableHeadFill(template) },
      margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
    });
    saveBranded(doc, template, `run-${run.period_end}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Depreciation Run</DialogTitle>
          <DialogDescription>
            {run ? `${run.period_start} → ${run.period_end}` : ""}
          </DialogDescription>
        </DialogHeader>
        {!run ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Type" value={run.run_type} />
              <Tile label="Status" value={run.status} />
              <Tile label="Assets" value={String(run.asset_count ?? 0)} />
              <Tile label="Total" value={formatUGX(run.total_amount)} highlight />
            </div>

            {(run.status === "failed" || run.status === "running") && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive">
                  {run.status === "failed" ? "Why this run failed" : "Run appears stuck"}
                </p>
                <p className="mt-1 text-xs">
                  {run.notes && run.notes.trim().length > 0
                    ? run.notes
                    : run.status === "failed"
                      ? "Run was marked failed but no reason was recorded."
                      : "Run started but never completed."}
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  <p className="font-medium">Common causes:</p>
                  <ul className="ml-4 list-disc space-y-0.5">
                    <li>None of the selected assets are depreciable (missing method, useful life, or purchase value).</li>
                    <li>All selected assets already had an entry posted for this period (duplicates skipped).</li>
                    <li>Selected assets have reached residual value — no depreciation left to post.</li>
                    <li>Depreciation start date is after the run's period end.</li>
                    {run.status === "running" && <li>The browser tab was closed before the run finished.</li>}
                  </ul>
                </div>
              </div>
            )}

            {run.status !== "failed" && run.status !== "running" && run.notes && (
              <p className="text-xs text-muted-foreground">{run.notes}</p>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Entries posted ({entries.length})</p>
              <div className="max-h-72 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Tag</th>
                      <th className="px-2 py-1 text-left">Asset</th>
                      <th className="px-2 py-1 text-right">Opening</th>
                      <th className="px-2 py-1 text-right">Depreciation</th>
                      <th className="px-2 py-1 text-right">Accumulated</th>
                      <th className="px-2 py-1 text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">No entries.</td></tr>
                    ) : (entries as any[]).map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-2 py-1 font-mono">{e.assets?.asset_tag ?? "—"}</td>
                        <td className="px-2 py-1">{e.assets?.name ?? "—"}</td>
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
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
