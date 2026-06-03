import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, FileText, AlertTriangle } from "lucide-react";
import { formatUGX } from "@/lib/utils";
import {
  buildSchedule, computePeriod, netBookValue, isDepreciable,
  METHOD_LABEL, FREQ_LABEL, type DepreciationMethod, type DepreciationFrequency,
} from "@/lib/depreciation";
import { exportScheduleXLSX, exportSchedulePDF } from "@/lib/depreciation-export";

export function DepreciationPanel({ assetId }: { assetId: string }) {
  const { canWrite, canDo, isAdmin } = useAuth();
  const canManage = isAdmin || canWrite || canDo("manage_depreciation");
  const canOverride = isAdmin || canWrite || canDo("override_depreciation");
  const qc = useQueryClient();

  const { data: asset } = useQuery({
    queryKey: ["asset-dep", assetId],
    queryFn: async () => (await supabase.from("assets").select("*").eq("id", assetId).single()).data,
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["dep-entries", assetId],
    queryFn: async () =>
      (await supabase.from("depreciation_entries" as any)
        .select("*").eq("asset_id", assetId).order("period_end", { ascending: true })).data ?? [],
  });
  const { data: overrides = [] } = useQuery({
    queryKey: ["dep-overrides", assetId],
    queryFn: async () =>
      (await supabase.from("depreciation_overrides" as any)
        .select("*").eq("asset_id", assetId).order("effective_date", { ascending: false })).data ?? [],
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const startEdit = () => {
    if (!asset) return;
    setForm({
      depreciation_method: asset.depreciation_method ?? "straight_line",
      useful_life_months: asset.useful_life_months ?? 60,
      residual_value: asset.residual_value ?? 0,
      depreciation_start_date: asset.depreciation_start_date ?? asset.purchase_date ?? new Date().toISOString().slice(0, 10),
      depreciation_frequency: asset.depreciation_frequency ?? "monthly",
      total_units: asset.total_units ?? "",
    });
    setEditing(true);
  };
  const save = async () => {
    if (!asset) return;
    const cost = Number(asset.purchase_value ?? 0);
    const res = Number(form.residual_value ?? 0);
    if (res < 0) return toast.error("Residual value cannot be negative");
    if (cost && res >= cost) return toast.error("Residual must be less than purchase value");
    if (Number(form.useful_life_months) <= 0) return toast.error("Useful life must be greater than 0");
    const payload: any = {
      depreciation_method: form.depreciation_method,
      useful_life_months: Number(form.useful_life_months),
      residual_value: Number(form.residual_value),
      depreciation_start_date: form.depreciation_start_date || null,
      depreciation_frequency: form.depreciation_frequency,
      total_units: form.total_units ? Number(form.total_units) : null,
    };
    const { error } = await supabase.from("assets").update(payload).eq("id", assetId);
    if (error) return toast.error(error.message);
    toast.success("Depreciation settings saved");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["asset-dep", assetId] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  // Override / impairment
  const [ovType, setOvType] = useState<string>("impairment");
  const [ovAmount, setOvAmount] = useState("");
  const [ovReason, setOvReason] = useState("");
  const submitOverride = async () => {
    const amt = Number(ovAmount);
    if (!amt || amt < 0) return toast.error("Amount required");
    if (!ovReason.trim()) return toast.error("Reason required");
    const { error: e1 } = await supabase.from("depreciation_overrides" as any).insert({
      asset_id: assetId, type: ovType, amount: amt, reason: ovReason.trim(),
    });
    if (e1) return toast.error(e1.message);
    if (ovType === "impairment") {
      const newImp = Number(asset?.impairment_amount ?? 0) + amt;
      await supabase.from("assets").update({ impairment_amount: newImp }).eq("id", assetId);
    } else if (ovType === "residual_change") {
      await supabase.from("assets").update({ residual_value: amt }).eq("id", assetId);
    }
    toast.success("Override recorded");
    setOvAmount(""); setOvReason("");
    qc.invalidateQueries({ queryKey: ["asset-dep", assetId] });
    qc.invalidateQueries({ queryKey: ["dep-overrides", assetId] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  const schedule = useMemo(() => asset ? buildSchedule(asset as any) : [], [asset]);
  const nbv = asset ? netBookValue(asset as any) : 0;
  const atResidual = asset && nbv <= Number(asset.residual_value ?? 0) + 0.01;
  const fullyDepreciated = asset && !isDepreciable(asset as any) && (Number(asset.purchase_value ?? 0) > 0);

  if (!asset) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;

  const cfgComplete = asset.depreciation_method && asset.useful_life_months && asset.purchase_value;

  return (
    <div className="space-y-5 py-3">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Purchase value</p>
          <p className="text-lg font-semibold tabular-nums">{formatUGX(asset.purchase_value)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Accumulated</p>
          <p className="text-lg font-semibold tabular-nums">{formatUGX(asset.accumulated_depreciation)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Impairment</p>
          <p className="text-lg font-semibold tabular-nums">{formatUGX(asset.impairment_amount)}</p>
        </div>
        <div className="rounded-lg border bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">Net book value</p>
          <p className="text-lg font-semibold tabular-nums text-primary">{formatUGX(nbv)}</p>
        </div>
      </div>

      {(atResidual || fullyDepreciated) && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <p>Asset has reached its residual value and is no longer depreciating.</p>
        </div>
      )}

      {/* Config */}
      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Depreciation configuration</h3>
          {canManage && !editing && (
            <Button size="sm" variant="outline" onClick={startEdit}>{cfgComplete ? "Edit" : "Configure"}</Button>
          )}
        </div>
        {!editing ? (
          cfgComplete ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">Method:</span> {METHOD_LABEL[asset.depreciation_method as DepreciationMethod]}</p>
              <p><span className="text-muted-foreground">Frequency:</span> {FREQ_LABEL[(asset.depreciation_frequency ?? "monthly") as DepreciationFrequency]}</p>
              <p><span className="text-muted-foreground">Useful life:</span> {asset.useful_life_months} months</p>
              <p><span className="text-muted-foreground">Residual value:</span> {formatUGX(asset.residual_value)}</p>
              <p><span className="text-muted-foreground">Start date:</span> {asset.depreciation_start_date ?? "—"}</p>
              <p><span className="text-muted-foreground">Last run:</span> {asset.last_depreciation_date ?? "Never"}</p>
              {asset.depreciation_method === "units_of_production" && (
                <p><span className="text-muted-foreground">Total units:</span> {asset.total_units ?? "—"} (used {asset.units_consumed ?? 0})</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not configured. Set method, useful life, and residual value to enable depreciation.</p>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Method *</Label>
              <Select value={form.depreciation_method} onValueChange={(v) => setForm({ ...form, depreciation_method: v as DepreciationMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as DepreciationMethod[]).map((k) => (
                    <SelectItem key={k} value={k}>{METHOD_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.depreciation_frequency} onValueChange={(v) => setForm({ ...form, depreciation_frequency: v as DepreciationFrequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQ_LABEL) as DepreciationFrequency[]).map((k) => (
                    <SelectItem key={k} value={k}>{FREQ_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Useful life (months) *</Label>
              <Input type="number" min={1} value={form.useful_life_months}
                onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Residual value (UGX)</Label>
              <Input type="number" min={0} value={form.residual_value}
                onChange={(e) => setForm({ ...form, residual_value: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input type="date" value={form.depreciation_start_date}
                onChange={(e) => setForm({ ...form, depreciation_start_date: e.target.value })} />
            </div>
            {form.depreciation_method === "units_of_production" && (
              <div className="space-y-2">
                <Label>Total expected units</Label>
                <Input type="number" min={0} value={form.total_units}
                  onChange={(e) => setForm({ ...form, total_units: e.target.value })} />
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </div>

      {/* Override / impair */}
      {canOverride && cfgComplete && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-semibold">Record impairment / adjustment</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={ovType} onValueChange={setOvType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="impairment">Impairment</SelectItem>
                  <SelectItem value="residual_change">Residual change</SelectItem>
                  <SelectItem value="manual_adjustment">Manual adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (UGX)</Label>
              <Input type="number" min={0} value={ovAmount} onChange={(e) => setOvAmount(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Reason</Label>
              <Input value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="Reason for adjustment" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={submitOverride}>Record</Button>
          </div>
          {overrides.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs uppercase text-muted-foreground">History</p>
              <ul className="space-y-1 text-sm">
                {(overrides as any[]).map((o) => (
                  <li key={o.id} className="flex justify-between border-b py-1.5 text-xs">
                    <span><Badge variant="outline" className="mr-2">{o.type.replace("_", " ")}</Badge>{o.reason}</span>
                    <span className="tabular-nums">{formatUGX(o.amount)} <span className="text-muted-foreground">· {o.effective_date}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Posted entries */}
      {entries.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-semibold">Posted depreciation entries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2">Period</th>
                  <th className="py-2 pr-2 text-right">Opening</th>
                  <th className="py-2 pr-2 text-right">Depreciation</th>
                  <th className="py-2 pr-2 text-right">Accumulated</th>
                  <th className="py-2 pr-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {(entries as any[]).map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{e.period_start} → {e.period_end}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatUGX(e.opening_value)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatUGX(e.depreciation_amount)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatUGX(e.accumulated_after)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatUGX(e.closing_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Forward schedule */}
      {schedule.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Forecasted schedule</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => exportScheduleXLSX(`${asset.asset_tag}-schedule`, schedule)}>
                <Download className="mr-1 h-3 w-3" /> Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportSchedulePDF(`${asset.asset_tag} – Depreciation schedule`, schedule, asset.name)}>
                <FileText className="mr-1 h-3 w-3" /> PDF
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Period start</th>
                  <th className="px-2 py-1.5">Period end</th>
                  <th className="px-2 py-1.5 text-right">Opening</th>
                  <th className="px-2 py-1.5 text-right">Depreciation</th>
                  <th className="px-2 py-1.5 text-right">Accumulated</th>
                  <th className="px-2 py-1.5 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={r.index} className="border-t">
                    <td className="px-2 py-1">{r.index}</td>
                    <td className="px-2 py-1">{r.periodStart}</td>
                    <td className="px-2 py-1">{r.periodEnd}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatUGX(r.opening)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatUGX(r.depreciation)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatUGX(r.accumulated)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatUGX(r.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
