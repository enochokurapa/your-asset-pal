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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, Download, FileText, TrendingDown, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatUGX } from "@/lib/utils";
import {
  computePeriod, isDepreciable, netBookValue,
  previousPeriodWindow, periodMonths,
  type DepreciationFrequency,
} from "@/lib/depreciation";
import { exportReportXLSX, exportReportPDF } from "@/lib/depreciation-export";
import { AssetInsightDialog } from "@/components/asset-insight-dialog";
import { RunInsightDialog } from "@/components/run-insight-dialog";

export const Route = createFileRoute("/_app/depreciation")({
  component: DepreciationPage,
});

function DepreciationPage() {
  const { canView, canWrite, isAdmin, canDo, canSeeBranch } = useAuth();
  if (!canView("depreciation")) return <Navigate to="/dashboard" />;
  const canRun = isAdmin || canWrite || canDo("run_depreciation");
  const qc = useQueryClient();

  const { data: runs = [] } = useQuery({
    queryKey: ["dep-runs"],
    queryFn: async () =>
      (await supabase.from("depreciation_runs" as any).select("*").order("period_end", { ascending: false }).limit(100)).data ?? [],
  });

  const { data: assetsRaw = [] } = useQuery({
    queryKey: ["dep-assets"],
    queryFn: async () =>
      (await supabase.from("assets")
        .select("*, categories(name), branches(name)")
        .order("name")).data ?? [],
  });
  const assets = useMemo(
    () => (assetsRaw as any[]).filter((a) => canSeeBranch(a.branch_id)),
    [assetsRaw, canSeeBranch],
  );
  const visibleAssetIds = useMemo(() => new Set(assets.map((a: any) => a.id)), [assets]);

  const { data: entriesRaw = [] } = useQuery({
    queryKey: ["dep-entries-all"],
    queryFn: async () =>
      (await supabase.from("depreciation_entries" as any)
        .select("*").order("period_end", { ascending: false }).limit(500)).data ?? [],
  });
  const entries = useMemo(
    () => (entriesRaw as any[]).filter((e) => visibleAssetIds.has(e.asset_id)),
    [entriesRaw, visibleAssetIds],
  );

  const { data: overrides = [] } = useQuery({
    queryKey: ["dep-overrides-all"],
    queryFn: async () =>
      (await supabase.from("depreciation_overrides" as any)
        .select("*").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles as any[]).forEach((p) => m.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
    return m;
  }, [profiles]);
  const assetMap = useMemo(() => {
    const m = new Map<string, any>();
    (assets as any[]).forEach((a) => m.set(a.id, a));
    return m;
  }, [assets]);

  // ---------- Run dialog ----------
  const [runOpen, setRunOpen] = useState(false);
  const [freq, setFreq] = useState<DepreciationFrequency>("monthly");
  const prevWin = useMemo(() => previousPeriodWindow(freq), [freq]);
  const [pStart, setPStart] = useState(prevWin.start);
  const [pEnd, setPEnd] = useState(prevWin.end);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assetFilter, setAssetFilter] = useState("");
  const [missedOnly, setMissedOnly] = useState(false);

  const openRun = () => {
    const w = previousPeriodWindow(freq);
    setPStart(w.start); setPEnd(w.end);
    setRunOpen(true);
  };

  const [running, setRunning] = useState(false);
  const submitRun = async () => {
    if (!pStart || !pEnd) return toast.error("Period required");
    if (pStart >= pEnd) return toast.error("Period start must be before end");
    if (selectedIds.size === 0) return toast.error("Select at least one asset");
    const single = selectedIds.size === 1;
    setRunning(true);
    let runId: string | null = null;
    const logStep = async (step: string, status: "info" | "success" | "warning" | "error", message?: string, asset_id?: string | null) => {
      if (!runId) return;
      try {
        await supabase.from("depreciation_run_logs" as any).insert({ run_id: runId, step, status, message: message ?? null, asset_id: asset_id ?? null });
      } catch { /* non-fatal */ }
    };
    try {
      const firstId = selectedIds.values().next().value as string;
      const runType = missedOnly ? "missed" : single ? "manual_asset" : "manual";
      const { data: run, error: e1 } = await supabase.from("depreciation_runs" as any).insert({
        period_start: pStart, period_end: pEnd,
        run_type: runType,
        status: "running",
        notes: single ? `Single asset: ${assetMap.get(firstId)?.asset_tag ?? ""}` : `Selected: ${selectedIds.size} asset(s)${missedOnly ? " (missed catch-up)" : ""}`,
      }).select().single();
      if (e1 || !run) throw new Error(e1?.message ?? "Failed to create run record");
      runId = (run as any).id;
      await logStep("init", "info", `Run created for ${pStart} → ${pEnd} · ${selectedIds.size} asset(s) selected`);

      const pool = (assets as any[]).filter((a) => selectedIds.has(a.id));
      await logStep("prepare", "info", `Validating ${pool.length} asset(s) for depreciation eligibility`);

      let total = 0; let count = 0; let skipped = 0;
      for (const a of pool) {
        if (!isDepreciable(a)) { skipped++; await logStep("skip", "warning", `Not depreciable (missing method, useful life, or purchase value)`, a.id); continue; }
        const { data: dup } = await supabase.from("depreciation_entries" as any)
          .select("id").eq("asset_id", a.id).eq("period_end", pEnd).maybeSingle();
        if (dup) { skipped++; await logStep("skip", "warning", `Entry already posted for ${pEnd}`, a.id); continue; }
        const r = computePeriod(a);
        if (r.depreciation <= 0) { skipped++; await logStep("skip", "warning", `Computed depreciation is zero (asset may have reached residual)`, a.id); continue; }
        const { error: e2 } = await supabase.from("depreciation_entries" as any).insert({
          run_id: runId, asset_id: a.id,
          period_start: pStart, period_end: pEnd,
          method: a.depreciation_method,
          opening_value: r.opening,
          depreciation_amount: r.depreciation,
          accumulated_after: r.accumulated,
          closing_value: r.closing,
        });
        if (e2) { await logStep("post", "error", `Insert failed: ${e2.message}`, a.id); continue; }
        await supabase.from("assets").update({
          accumulated_depreciation: r.accumulated,
          last_depreciation_date: pEnd,
        }).eq("id", a.id);
        await logStep("post", "success", `Posted ${formatUGX(r.depreciation)} · NBV ${formatUGX(r.closing)}`, a.id);
        total += r.depreciation; count += 1;
      }
      const finalStatus = count === 0 ? "failed" : "completed";
      const finalNote = `${single ? `Single asset: ${assetMap.get(firstId)?.asset_tag ?? ""}` : `Selected: ${pool.length} asset(s)`}${count === 0 ? " — no eligible entry posted" : ""}`;
      const failReason = count === 0
        ? `No entries posted. ${skipped} asset(s) skipped — none were eligible (already posted, at residual, or missing depreciation config).`
        : null;
      await supabase.from("depreciation_runs" as any).update({
        status: finalStatus, total_amount: total, asset_count: count,
        notes: finalNote,
        error_message: failReason,
      }).eq("id", runId);
      await logStep("finalize", count === 0 ? "error" : "success", `${count} posted · ${skipped} skipped · total ${formatUGX(total)}`);
      if (count === 0) toast.warning(`No entries posted (${skipped} skipped)`);
      else toast.success(`Run complete · ${count} asset(s) · ${formatUGX(total)}`);
      setRunOpen(false);
      qc.invalidateQueries({ queryKey: ["dep-runs"] });
      qc.invalidateQueries({ queryKey: ["dep-assets"] });
      qc.invalidateQueries({ queryKey: ["dep-entries-all"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (e: any) {
      const msg = e?.message ?? "Run failed";
      const stack = e?.stack ?? null;
      if (runId) {
        await supabase.from("depreciation_runs" as any).update({
          status: "failed",
          error_message: msg,
          error_stack: stack,
        }).eq("id", runId);
        await logStep("error", "error", msg);
      }
      toast.error(msg);
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
      pct: a.purchase_value ? Math.round((Number(a.accumulated_depreciation ?? 0) / Number(a.purchase_value)) * 100) : 0,
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

  // ---------- Alerts ----------
  const alerts = useMemo(() => {
    const list: { kind: "failed" | "missing" | "residual"; severity: "warn" | "error"; title: string; detail: string; assetId?: string; runId?: string }[] = [];

    for (const r of (runs as any[])) {
      if (r.status === "failed") {
        list.push({
          kind: "failed", severity: "error", runId: r.id,
          title: `Failed run · ${r.period_start} → ${r.period_end}`,
          detail: r.notes ?? "Run marked as failed.",
        });
      } else if (r.status === "running" && new Date(r.created_at).getTime() < Date.now() - 30 * 60 * 1000) {
        list.push({
          kind: "failed", severity: "error", runId: r.id,
          title: `Stuck run · ${r.period_start} → ${r.period_end}`,
          detail: "Run started over 30 minutes ago and never completed.",
        });
      }
    }

    const today = new Date();
    for (const a of (assets as any[])) {
      if (!isDepreciable(a)) continue;
      if (!a.depreciation_start_date) continue;
      const f: DepreciationFrequency = (a.depreciation_frequency ?? "monthly") as DepreciationFrequency;
      const months = periodMonths(f);
      const last = a.last_depreciation_date ? new Date(a.last_depreciation_date) : new Date(a.depreciation_start_date);
      const due = new Date(last);
      due.setMonth(due.getMonth() + months * 2);
      if (today > due) {
        list.push({
          kind: "missing", severity: "warn", assetId: a.id,
          title: `Missing depreciation · ${a.asset_tag} — ${a.name}`,
          detail: `Last posted ${a.last_depreciation_date ?? "never"} (${f}).`,
        });
      }
    }

    for (const a of (assets as any[])) {
      if (!a.purchase_value || !a.depreciation_method) continue;
      const nbv = netBookValue(a);
      const res = Number(a.residual_value ?? 0);
      if (nbv <= res + 0.01 && Number(a.accumulated_depreciation ?? 0) > 0) {
        list.push({
          kind: "residual", severity: "warn", assetId: a.id,
          title: `At residual · ${a.asset_tag} — ${a.name}`,
          detail: `NBV ${formatUGX(nbv)} reached residual ${formatUGX(res)}. Depreciation has stopped.`,
        });
      }
    }
    return list;
  }, [runs, assets]);

  // Insight dialog state
  const [insightAssetId, setInsightAssetId] = useState<string | null>(null);
  const [insightFocus, setInsightFocus] = useState<"missed" | "nbv" | "accumulated" | "audit" | "general">("general");
  const [insightOpen, setInsightOpen] = useState(false);
  const openAssetInsight = (id: string, focus: typeof insightFocus = "general") => {
    setInsightAssetId(id); setInsightFocus(focus); setInsightOpen(true);
  };
  const tagToId = useMemo(() => {
    const m = new Map<string, string>();
    (assets as any[]).forEach((a) => m.set(a.asset_tag, a.id));
    return m;
  }, [assets]);

  const [insightRun, setInsightRun] = useState<any | null>(null);
  const [runInsightOpen, setRunInsightOpen] = useState(false);
  const openRunInsight = (r: any) => { setInsightRun(r); setRunInsightOpen(true); };

  // ---------- Audit ----------
  const [aAsset, setAAsset] = useState<string>("all");
  const [aRun, setARun] = useState<string>("all");
  const [aOvType, setAOvType] = useState<string>("all");
  const [aUser, setAUser] = useState<string>("all");

  const auditEvents = useMemo(() => {
    type Ev = {
      when: string; kind: "run" | "entry" | "override"; user_id: string | null;
      asset_id: string | null; run_id: string | null; override_type: string | null;
      summary: string; amount: number;
    };
    const list: Ev[] = [];
    for (const r of (runs as any[])) {
      list.push({
        when: r.created_at, kind: "run", user_id: r.triggered_by,
        asset_id: null, run_id: r.id, override_type: null,
        summary: `${r.run_type} run ${r.period_start} → ${r.period_end} · ${r.status} · ${r.asset_count} asset(s)`,
        amount: Number(r.total_amount ?? 0),
      });
    }
    for (const e of (entries as any[])) {
      list.push({
        when: e.created_at, kind: "entry", user_id: null,
        asset_id: e.asset_id, run_id: e.run_id, override_type: null,
        summary: `Posted ${e.method} entry · ${e.period_start} → ${e.period_end}`,
        amount: Number(e.depreciation_amount ?? 0),
      });
    }
    for (const o of (overrides as any[])) {
      list.push({
        when: o.created_at, kind: "override", user_id: o.created_by,
        asset_id: o.asset_id, run_id: null, override_type: o.type,
        summary: `${o.type.replace("_", " ")} · ${o.reason ?? "—"}`,
        amount: Number(o.amount ?? 0),
      });
    }
    return list
      .filter((e) => aAsset === "all" || e.asset_id === aAsset)
      .filter((e) => aRun === "all" || e.run_id === aRun)
      .filter((e) => aOvType === "all" || e.override_type === aOvType)
      .filter((e) => aUser === "all" || e.user_id === aUser)
      .sort((a, b) => +new Date(b.when) - +new Date(a.when));
  }, [runs, entries, overrides, aAsset, aRun, aOvType, aUser]);

  const exportAudit = (kind: "xlsx" | "pdf") => {
    const headers = ["When", "Kind", "Asset", "Period / Run", "Override type", "User", "Summary", "Amount"];
    const rows = auditEvents.map((e) => {
      const asset = e.asset_id ? assetMap.get(e.asset_id) : null;
      const run = e.run_id ? (runs as any[]).find((r) => r.id === e.run_id) : null;
      return [
        new Date(e.when).toLocaleString(),
        e.kind,
        asset ? `${asset.asset_tag} — ${asset.name}` : "—",
        run ? `${run.period_start} → ${run.period_end}` : "—",
        e.override_type ?? "—",
        e.user_id ? (userMap.get(e.user_id) ?? "—") : "—",
        e.summary,
        e.amount,
      ] as (string | number)[];
    });
    const title = "Depreciation audit log";
    if (kind === "xlsx") exportReportXLSX(title, headers, rows);
    else exportReportPDF(title, headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depreciation</h1>
          <p className="text-sm text-muted-foreground">Runs, schedules, reports, and audit across all assets. All amounts in UGX.</p>
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
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap">
          <TabsTrigger value="nbv">NBV report</TabsTrigger>
          <TabsTrigger value="accumulated">Accumulated</TabsTrigger>
          <TabsTrigger value="category">By category</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts {alerts.length > 0 && <Badge variant="destructive" className="ml-2">{alerts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="runs">Runs history</TabsTrigger>
        </TabsList>


        <TabsContent value="nbv">
          <ReportTable
            title="Net book value"
            headers={["Tag", "Name", "Category", "Branch", "Cost", "Accumulated", "Impairment", "NBV"]}
            numericIdx={[4, 5, 6, 7]}
            rows={reportRows.map((r) => [r.tag, r.name, r.category, r.branch, r.cost, r.accumulated, r.impairment, r.nbv])}
            onRowClick={(r) => { const id = tagToId.get(String(r[0])); if (id) openAssetInsight(id, "nbv"); }}
          />
        </TabsContent>
        <TabsContent value="accumulated">
          <ReportTable
            title="Accumulated depreciation"
            headers={["Tag", "Name", "Method", "Cost", "Accumulated", "% Depreciated"]}
            numericIdx={[3, 4, 5]}
            rows={reportRows.map((r) => [r.tag, r.name, r.method, r.cost, r.accumulated, `${r.pct}%`])}
            onRowClick={(r) => { const id = tagToId.get(String(r[0])); if (id) openAssetInsight(id, "accumulated"); }}
          />
        </TabsContent>
        <TabsContent value="category">
          <ReportTable
            title="Depreciation by category"
            headers={["Category", "Assets", "Cost", "Accumulated", "NBV"]}
            numericIdx={[1, 2, 3, 4]}
            rows={byCategory.map((c) => [c.cat, c.count, c.cost, c.accumulated, c.nbv])}
          />
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="p-4">
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> All clear — no missing runs, no failures, no assets at residual.
              </div>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a, i) => {
                  const clickable = !!a.assetId || !!a.runId;
                  return (
                    <li
                      key={i}
                      onClick={() => {
                        if (a.assetId) openAssetInsight(a.assetId, a.kind === "missing" ? "missed" : "general");
                        else if (a.runId) {
                          const r = (runs as any[]).find((x) => x.id === a.runId);
                          if (r) openRunInsight(r);
                        }
                      }}
                      className={`flex items-start gap-3 rounded-md border p-3 text-sm ${a.severity === "error" ? "border-destructive/40 bg-destructive/5" : "border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10"} ${clickable ? "cursor-pointer hover:bg-muted/40" : ""}`}
                    >
                      {a.severity === "error"
                        ? <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                        : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
                      <div className="flex-1">
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.detail}</p>
                      </div>
                      <Badge variant="outline" className="capitalize">{a.kind}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="grid flex-1 gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Asset</Label>
                  <Select value={aAsset} onValueChange={setAAsset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">All assets</SelectItem>
                      {(assets as any[]).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.asset_tag} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Run period</Label>
                  <Select value={aRun} onValueChange={setARun}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">All runs</SelectItem>
                      {(runs as any[]).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.period_start} → {r.period_end}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Override type</Label>
                  <Select value={aOvType} onValueChange={setAOvType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="impairment">Impairment</SelectItem>
                      <SelectItem value="residual_change">Residual change</SelectItem>
                      <SelectItem value="manual_adjustment">Manual adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">User</Label>
                  <Select value={aUser} onValueChange={setAUser}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">All users</SelectItem>
                      {(profiles as any[]).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportAudit("xlsx")}>
                  <Download className="mr-1 h-3 w-3" /> Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportAudit("pdf")}>
                  <FileText className="mr-1 h-3 w-3" /> PDF
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs table-auto">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">When</th>
                    <th className="px-2 py-1.5 text-left">Kind</th>
                    <th className="px-2 py-1.5 text-left">Asset</th>
                    <th className="px-2 py-1.5 text-left">Period / Run</th>
                    <th className="px-2 py-1.5 text-left">Override</th>
                    <th className="px-2 py-1.5 text-left">User</th>
                    <th className="px-2 py-1.5 text-left">Summary</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.length === 0 ? (
                    <tr><td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">No events match the filters.</td></tr>
                  ) : auditEvents.map((e, i) => {
                    const asset = e.asset_id ? assetMap.get(e.asset_id) : null;
                    const run = e.run_id ? (runs as any[]).find((r) => r.id === e.run_id) : null;
                    return (
                      <tr
                        key={i}
                        onClick={() => {
                          if (e.asset_id) openAssetInsight(e.asset_id, "audit");
                          else if (run) openRunInsight(run);
                        }}
                        className={`border-t ${(e.asset_id || run) ? "cursor-pointer hover:bg-muted/40" : ""}`}
                      >
                        <td className="px-2 py-1 whitespace-nowrap">{new Date(e.when).toLocaleString()}</td>
                        <td className="px-2 py-1"><Badge variant="outline" className="capitalize">{e.kind}</Badge></td>
                        <td className="px-2 py-1">{asset ? `${asset.asset_tag} — ${asset.name}` : "—"}</td>
                        <td className="px-2 py-1">{run ? `${run.period_start} → ${run.period_end}` : "—"}</td>
                        <td className="px-2 py-1 capitalize">{e.override_type ? e.override_type.replace("_", " ") : "—"}</td>
                        <td className="px-2 py-1">{e.user_id ? (userMap.get(e.user_id) ?? "—") : "—"}</td>
                        <td className="px-2 py-1">{e.summary}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{e.amount ? formatUGX(e.amount) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-auto">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Assets</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                    <th className="px-3 py-2 text-left">Run at</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs as any[]).length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No runs yet.</td></tr>
                  ) : (runs as any[]).map((r) => (
                    <tr key={r.id} onClick={() => openRunInsight(r)} className="border-b last:border-0 cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2">{r.period_start} → {r.period_end}</td>
                      <td className="px-3 py-2 capitalize">{r.run_type.replace("_", " ")}</td>
                      <td className="px-3 py-2 capitalize">
                        <Badge variant={r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.asset_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUGX(r.total_amount)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <AssetInsightDialog assetId={insightAssetId} focus={insightFocus} open={insightOpen} onOpenChange={setInsightOpen} />
      <RunInsightDialog run={insightRun} open={runInsightOpen} onOpenChange={setRunInsightOpen} />

      <Dialog open={runOpen} onOpenChange={(o) => { setRunOpen(o); if (!o) { setSelectedIds(new Set()); setAssetFilter(""); setMissedOnly(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingDown className="h-5 w-5" /> Run depreciation</DialogTitle>
            <DialogDescription>Tick assets to include, or use "Missed only" to pick up assets whose depreciation wasn't posted for this period. Duplicate entries per asset/period are skipped. Requires the "run depreciation" permission granted by the super admin.</DialogDescription>
          </DialogHeader>
          {(() => {
            const eligibleAll = (assets as any[]).filter((a) => a.purchase_value && a.depreciation_method);
            const eligible = missedOnly
              ? eligibleAll.filter((a) => !a.last_depreciation_date || a.last_depreciation_date < pEnd)
              : eligibleAll;
            const filtered = eligible.filter((a) => {
              const q = assetFilter.toLowerCase().trim();
              if (!q) return true;
              return (a.asset_tag ?? "").toLowerCase().includes(q) || (a.name ?? "").toLowerCase().includes(q);
            });
            const allSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));
            const toggleAll = () => {
              const next = new Set(selectedIds);
              if (allSelected) filtered.forEach((a) => next.delete(a.id));
              else filtered.forEach((a) => next.add(a.id));
              setSelectedIds(next);
            };
            const toggleOne = (id: string) => {
              const next = new Set(selectedIds);
              if (next.has(id)) next.delete(id); else next.add(id);
              setSelectedIds(next);
            };
            return (
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
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Assets ({selectedIds.size} selected / {eligible.length} {missedOnly ? "missed" : "eligible"})</Label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={missedOnly}
                          onChange={(e) => { setMissedOnly(e.target.checked); setSelectedIds(new Set()); }}
                          className="h-3.5 w-3.5"
                        />
                        Missed only
                      </label>
                      <Input
                        placeholder="Filter by tag or name…"
                        value={assetFilter}
                        onChange={(e) => setAssetFilter(e.target.value)}
                        className="h-8 max-w-xs"
                      />
                    </div>
                  </div>
                  <div className="rounded-md border">
                    <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4"
                        id="dep-select-all"
                      />
                      <label htmlFor="dep-select-all" className="text-sm font-medium cursor-pointer">
                        {allSelected ? "Unselect all" : "Select all"} {assetFilter && `(${filtered.length} shown)`}
                      </label>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {filtered.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">No eligible assets.</div>
                      ) : filtered.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm hover:bg-muted/40 cursor-pointer last:border-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(a.id)}
                            onChange={() => toggleOne(a.id)}
                            className="h-4 w-4"
                          />
                          <span className="font-mono text-xs">{a.asset_tag}</span>
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground">{a.depreciation_method}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button onClick={submitRun} disabled={running || selectedIds.size === 0}>
              {running ? "Running…" : `Run for ${selectedIds.size || 0} asset(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportTable({
  title, headers, rows, numericIdx = [], onRowClick,
}: {
  title: string; headers: string[]; rows: (string | number)[][]; numericIdx?: number[];
  onRowClick?: (row: (string | number)[]) => void;
}) {
  const isNum = (i: number) => numericIdx.includes(i);
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
        <table className="w-full text-xs table-auto">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={`px-2 py-1.5 ${isNum(i) ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-2 py-8 text-center text-muted-foreground">No data.</td></tr>
            ) : rows.map((r, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-t ${onRowClick ? "cursor-pointer hover:bg-muted/40" : ""}`}
              >
                {r.map((c, j) => (
                  <td key={j} className={`px-2 py-1 ${isNum(j) ? "text-right tabular-nums" : ""}`}>
                    {isNum(j) && typeof c === "number" ? formatUGX(c) : c}
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
