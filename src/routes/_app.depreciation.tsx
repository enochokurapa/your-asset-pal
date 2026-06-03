import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Play, Download, FileText, TrendingDown } from "lucide-react";
import { formatUGX } from "@/lib/utils";
import {
  computePeriod, isDepreciable, netBookValue,
  currentPeriodWindow, previousPeriodWindow,
  type DepreciationFrequency,
} from "@/lib/depreciation";
import { exportReportXLSX, exportReportPDF } from "@/lib/depreciation-export";

export const Route = createFileRoute("/_app/depreciation")({
  component: DepreciationPage,
});

function DepreciationPage() {
  const { canView, canWrite, isAdmin, canDo } = useAuth();
  if (!canView("depreciation")) return <Navigate to="/dashboard" />;
  const canRun = isAdmin || canWrite || canDo("run_depreciation");
  const qc = useQueryClient();

  const { data: runs = [] } = useQuery({
    queryKey: ["dep-runs"],
    queryFn: async () =>
      (await supabase.from("depreciation_runs" as any).select("*").order("period_end", { ascending: false }).limit(50)).data ?? [],
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["dep-assets"],
    queryFn: async () =>
      (await supabase.from("assets")
        .select("*, categories(name), branches(name)")
        .order("name")).data ?? [],
  });

  const [runOpen, setRunOpen] = useState(false);
  const [freq, setFreq] = useState<DepreciationFrequency>("monthly");
  const prevWin = useMemo(() => previousPeriodWindow(freq), [freq]);
  const [pStart, setPStart] = useState(prevWin.start);
  const [pEnd, setPEnd] = useState(prevWin.end);

  const openRun = () => {
    const w = previousPeriodWindow(freq);
    setPStart(w.start); setPEnd(w.end);
    setRunOpen(true);
  };

  const [running, setRunning] = useState(false);
  const submitRun = async () => {
    if (!pStart || !pEnd) return toast.error("Period required");
    if (pStart >= pEnd) return toast.error("Period start must be before end");
    setRunning(true);
    try {
      // Duplicate guard
      const { data: existing } = await supabase.from("depreciation_runs" as any)
        .select("id").eq("period_start", pStart).eq("period_end", pEnd).maybeSingle();
      if (existing) { toast.error("A run already exists for this period"); return; }

      const { data: run, error: e1 } = await supabase.from("depreciation_runs" as any).insert({
        period_start: pStart, period_end: pEnd, run_type: "manual", status: "running",
      }).select().single();
      if (e1 || !run) throw new Error(e1?.message ?? "Failed");

      let total = 0; let count = 0;
      for (const a of assets as any[]) {
        if (!isDepreciable(a)) continue;
        // Skip if asset already has entry for this period_end
        const { data: dup } = await supabase.from("depreciation_entries" as any)
          .select("id").eq("asset_id", a.id).eq("period_end", pEnd).maybeSingle();
        if (dup) continue;
        const r = computePeriod(a);
        if (r.depreciation <= 0) continue;
        const { error: e2 } = await supabase.from("depreciation_entries" as any).insert({
          run_id: (run as any).id, asset_id: a.id,
          period_start: pStart, period_end: pEnd,
          method: a.depreciation_method,
          opening_value: r.opening,
          depreciation_amount: r.depreciation,
          accumulated_after: r.accumulated,
          closing_value: r.closing,
        });
        if (e2) continue;
        await supabase.from("assets").update({
          accumulated_depreciation: r.accumulated,
          last_depreciation_date: pEnd,
        }).eq("id", a.id);
        total += r.depreciation; count += 1;
      }
      await supabase.from("depreciation_runs" as any).update({
        status: "completed", total_amount: total, asset_count: count,
      }).eq("id", (run as any).id);
      toast.success(`Run complete · ${count} assets · ${formatUGX(total)}`);
      setRunOpen(false);
      qc.invalidateQueries({ queryKey: ["dep-runs"] });
      qc.invalidateQueries({ queryKey: ["dep-assets"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  };

  // ---------- Reports ----------
  const reportRows = useMemo(() => (assets as any[])
    .filter((a) => a.purchase_value && a.depreciation_method)
    .map((a) => ({
      tag: a.asset_tag, name: a.name,
      category: a.categories?.name ?? "—",
      branch: a.branches?.name ?? "—",
      cost: Number(a.purchase_value ?? 0),
      accumulated: Number(a.accumulated_depreciation ?? 0),
      impairment: Number(a.impairment_amount ?? 0),
      nbv: netBookValue(a),
      method: a.depreciation_method,
    })), [assets]);

  const totals = reportRows.reduce(
    (acc, r) => ({ cost: acc.cost + r.cost, accumulated: acc.accumulated + r.accumulated, nbv: acc.nbv + r.nbv }),
    { cost: 0, accumulated: 0, nbv: 0 },
  );

  const byCategory = useMemo(() => {
    const m = new Map<string, { count: number; cost: number; accumulated: number; nbv: number }>();
    for (const r of reportRows) {
      const k = r.category;
      const cur = m.get(k) ?? { count: 0, cost: 0, accumulated: 0, nbv: 0 };
      cur.count++; cur.cost += r.cost; cur.accumulated += r.accumulated; cur.nbv += r.nbv;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([cat, v]) => ({ cat, ...v }));
  }, [reportRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depreciation</h1>
          <p className="text-sm text-muted-foreground">Runs, schedules, and reports across all assets. All amounts in UGX.</p>
        </div>
        {canRun && (
          <Button onClick={openRun}><Play className="mr-2 h-4 w-4" /> Run depreciation</Button>
        )}
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Eligible assets</p>
          <p className="mt-1 text-2xl font-bold">{reportRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total cost</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatUGX(totals.cost)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Accumulated</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatUGX(totals.accumulated)}</p>
        </Card>
        <Card className="p-4 border-primary/40 bg-primary/5">
          <p className="text-xs text-muted-foreground">Net book value</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{formatUGX(totals.nbv)}</p>
        </Card>
      </div>

      <Tabs defaultValue="nbv">
        <TabsList>
          <TabsTrigger value="nbv">NBV report</TabsTrigger>
          <TabsTrigger value="accumulated">Accumulated</TabsTrigger>
          <TabsTrigger value="category">By category</TabsTrigger>
          <TabsTrigger value="runs">Runs history</TabsTrigger>
        </TabsList>

        <TabsContent value="nbv">
          <ReportTable
            title="Net book value"
            headers={["Tag", "Name", "Category", "Branch", "Cost", "Accumulated", "Impairment", "NBV"]}
            rows={reportRows.map((r) => [r.tag, r.name, r.category, r.branch, r.cost, r.accumulated, r.impairment, r.nbv])}
          />
        </TabsContent>
        <TabsContent value="accumulated">
          <ReportTable
            title="Accumulated depreciation"
            headers={["Tag", "Name", "Method", "Cost", "Accumulated", "% Depreciated"]}
            rows={reportRows.map((r) => [
              r.tag, r.name, r.method,
              r.cost, r.accumulated,
              r.cost ? `${Math.round((r.accumulated / r.cost) * 100)}%` : "—",
            ])}
          />
        </TabsContent>
        <TabsContent value="category">
          <ReportTable
            title="Depreciation by category"
            headers={["Category", "Assets", "Cost", "Accumulated", "NBV"]}
            rows={byCategory.map((c) => [c.cat, c.count, c.cost, c.accumulated, c.nbv])}
          />
        </TabsContent>
        <TabsContent value="runs">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Assets</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Run at</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs as any[]).length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No runs yet.</td></tr>
                  ) : (runs as any[]).map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.period_start} → {r.period_end}</td>
                      <td className="px-3 py-2 capitalize">{r.run_type}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.asset_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUGX(r.total_amount)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingDown className="h-5 w-5" /> Run depreciation</DialogTitle>
            <DialogDescription>Posts depreciation for the selected period. Duplicate runs for the same period are blocked.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Frequency preset</Label>
              <Select value={freq} onValueChange={(v) => {
                const nf = v as DepreciationFrequency; setFreq(nf);
                const w = previousPeriodWindow(nf); setPStart(w.start); setPEnd(w.end);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Previous month</SelectItem>
                  <SelectItem value="quarterly">Previous quarter</SelectItem>
                  <SelectItem value="annually">Previous year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period start</Label>
              <Input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period end</Label>
              <Input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button onClick={submitRun} disabled={running}>{running ? "Running…" : "Run now"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportReportXLSX(title, headers, rows)}>
            <Download className="mr-1 h-3 w-3" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportReportPDF(title, headers, rows)}>
            <FileText className="mr-1 h-3 w-3" /> PDF
          </Button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-left">
            <tr>{headers.map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-2 py-8 text-center text-muted-foreground">No data.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className={`px-2 py-1 ${typeof c === "number" ? "text-right tabular-nums" : ""}`}>
                    {typeof c === "number" ? formatUGX(c) : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
