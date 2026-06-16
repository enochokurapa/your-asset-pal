import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, CheckCircle2, Wrench, Archive, Tags, MapPin, Building2, AlertTriangle, Trash2, Boxes, DoorOpen, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { PendingApprovalsCard } from "@/components/pending-approvals-card";
import { PendingGatePassesCard } from "@/components/pending-gate-passes-card";
import { TileAssetsDialog, type TileFilter } from "@/components/tile-assets-dialog";
import { formatUGX } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const STATUS_COLORS: Record<string, string> = {
  in_use: "hsl(142 71% 45%)",
  in_storage: "hsl(220 14% 60%)",
  under_repair: "hsl(38 92% 50%)",
  retired: "hsl(220 9% 46%)",
  missing: "hsl(0 84% 60%)",
  disposed: "hsl(220 9% 30%)",
};

function Dashboard() {
  const { canSeeBranch, branchScope } = useAuth();
  const scopeKey = branchScope ? Array.from(branchScope).sort().join(",") : "all";
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats", scopeKey, selectedBranch],

    queryFn: async () => {
      const [assets, cats, locs, branches, pending] = await Promise.all([
        supabase.from("assets").select("id,status,name,asset_tag,branch_id,set_for_disposal,purchase_value,created_at").order("created_at", { ascending: false }),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("locations").select("id", { count: "exact", head: true }),
        supabase.from("branches").select("id,name,code,is_active"),
        supabase.from("approval_requests").select("id,kind,asset_id,status,payload").eq("status", "pending"),
      ]);
      const list = (assets.data ?? [])
        .filter((a: any) => canSeeBranch(a.branch_id))
        .filter((a: any) => selectedBranch === "all" || a.branch_id === selectedBranch);
      const branchList = (branches.data ?? []).filter((b: any) => canSeeBranch(b.id));
      const branchesForFilter = branchList;
      const visibleBranchList = selectedBranch === "all" ? branchList : branchList.filter((b: any) => b.id === selectedBranch);
      const visibleAssetIds = new Set(list.map((a: any) => a.id));
      const pendList = (pending.data ?? []).filter((p: any) => !p.asset_id || visibleAssetIds.has(p.asset_id));


      const pendingRet = new Set(pendList.filter((p: any) => p.kind === "retirement").map((p: any) => p.asset_id));
      const pendingRepair = new Set(pendList.filter((p: any) => p.kind === "maintenance").map((p: any) => p.asset_id));
      const isParked = (a: any) => a.set_for_disposal || pendingRet.has(a.id) || pendingRepair.has(a.id);

      const perBranch = visibleBranchList.map((b: any) => ({
        ...b,
        assetCount: list.filter((a: any) => a.branch_id === b.id).length,
      }));

      const countStatus = (s: string) => list.filter((a: any) => a.status === s && !isParked(a)).length;
      const sumValue = (predicate: (a: any) => boolean) =>
        list.filter(predicate).reduce((acc: number, a: any) => acc + (Number(a.purchase_value) || 0), 0);
      const sumStatusValue = (s: string) => sumValue((a: any) => a.status === s && !isParked(a));
      const repairAmount = pendList
        .filter((p: any) => p.kind === "maintenance")
        .reduce((acc: number, p: any) => {
          const p2 = (p.payload ?? {}) as any;
          const amt = Number(p2.amount ?? p2.cost ?? p2.estimated_cost ?? p2.estimate ?? 0);
          return acc + (Number.isFinite(amt) ? amt : 0);
        }, 0);
      const statusCounts = ["in_use", "in_storage", "under_repair", "retired", "missing", "disposed"].map((s) => ({
        name: s.replace("_", " "), key: s, value: countStatus(s),
      }));
      return {
        total: list.length,
        totalValue: sumValue(() => true),
        active: list.filter((a: any) => !["disposed", "retired", "under_repair", "missing"].includes(a.status) && !isParked(a)).length,
        activeValue: sumValue((a: any) => !["disposed", "retired", "under_repair", "missing"].includes(a.status) && !isParked(a)),
        inUse: countStatus("in_use"),
        inUseValue: sumStatusValue("in_use"),
        inStorageValue: sumStatusValue("in_storage"),
        repair: countStatus("under_repair"),
        retired: countStatus("retired"),
        disposed: countStatus("disposed"),
        missing: countStatus("missing"),
        forDisposal: list.filter((a: any) => a.set_for_disposal).length,
        forRetirement: pendingRet.size,
        forRepair: pendingRepair.size,
        repairAmount,
        catCount: cats.count ?? 0,
        locCount: locs.count ?? 0,
        branchCount: visibleBranchList.length,
        perBranch,
        statusCounts,
        branchesForFilter,

      };
    },
  });

  // Each tile gets its own corporate accent color.
  const stats: { label: string; value: number; icon: any; color: string; filter: TileFilter; subtotal?: number }[] = [
    { label: "Total Assets",    value: data?.total ?? 0,       icon: Package,        color: "#1E3A8A", filter: { kind: "all" },                               subtotal: data?.totalValue },
    { label: "Active Assets",   value: data?.active ?? 0,      icon: CheckCircle2,   color: "#047857", filter: { kind: "active" },                            subtotal: data?.activeValue },
    { label: "Branches",        value: data?.branchCount ?? 0, icon: Building2,      color: "#7C3AED", filter: { kind: "all" } },
    { label: "In Storage",      value: data?.statusCounts.find((s) => s.key === "in_storage")?.value ?? 0, icon: Boxes, color: "#475569", filter: { kind: "status", status: "in_storage" }, subtotal: data?.inStorageValue },
    { label: "In Use",          value: data?.inUse ?? 0,       icon: CheckCircle2,   color: "#0E7490", filter: { kind: "status", status: "in_use" },          subtotal: data?.inUseValue },
    { label: "Under Repair",    value: data?.repair ?? 0,      icon: Wrench,         color: "#B45309", filter: { kind: "status", status: "under_repair" } },
    { label: "Retired",         value: data?.retired ?? 0,     icon: Archive,        color: "#52525B", filter: { kind: "status", status: "retired" } },
    { label: "Disposed",        value: data?.disposed ?? 0,    icon: Trash2,         color: "#3F3F46", filter: { kind: "status", status: "disposed" } },
    { label: "Missing",         value: data?.missing ?? 0,     icon: AlertTriangle,  color: "#B91C1C", filter: { kind: "status", status: "missing" } },
    { label: "For Disposal",    value: data?.forDisposal ?? 0, icon: Trash2,         color: "#C2410C", filter: { kind: "for_disposal" } },
    { label: "For Retirement",  value: data?.forRetirement ?? 0, icon: Archive,      color: "#A16207", filter: { kind: "pending_retirement" } },
    { label: "For Repair",      value: data?.forRepair ?? 0,   icon: Wrench,         color: "#BE185D", filter: { kind: "pending_repair" },                    subtotal: data?.repairAmount },
  ];

  const [tile, setTile] = useState<{ title: string; filter: TileFilter } | null>(null);

  const pieData = (data?.statusCounts ?? []).filter((s) => s.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {selectedBranch === "all"
              ? "Overview of your fixed assets across all branches."
              : `Viewing branch: ${(data?.branchesForFilter ?? []).find((b: any) => b.id === selectedBranch)?.name ?? ""}`}
          </p>
        </div>
        {(data?.branchesForFilter?.length ?? 0) > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Branch</span>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(data?.branchesForFilter ?? []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card
            key={s.label}
            onClick={() => setTile({ title: s.label, filter: s.filter })}
            className="group cursor-pointer overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              borderTop: `3px solid ${s.color}`,
              background: `linear-gradient(135deg, color-mix(in oklab, ${s.color} 8%, transparent), transparent 70%)`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: s.color }}>{s.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{isLoading ? "—" : s.value}</p>
                {s.subtotal !== undefined && s.subtotal > 0 && (
                  <p className="mt-1 text-xs font-medium text-muted-foreground tabular-nums">{formatUGX(s.subtotal)}</p>
                )}
              </div>
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-110"
                style={{ backgroundColor: `color-mix(in oklab, ${s.color} 18%, transparent)`, color: s.color }}
              >
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <TileAssetsDialog
        open={!!tile}
        onOpenChange={(v) => { if (!v) setTile(null); }}
        title={tile?.title ?? ""}
        filter={tile?.filter ?? { kind: "all" }}
        branchId={selectedBranch === "all" ? null : selectedBranch}
      />


      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Asset condition</h2>
          {pieData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No assets yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? "hsl(220 14% 60%)"} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Assets per branch</h2>
          {!data?.perBranch.length ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No branches yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.perBranch}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="assetCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2"><PendingApprovalsCard /></div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Portfolio</h2>
          <div className="mt-4 space-y-4">
            <Row icon={Building2} label="Branches" value={data?.branchCount ?? 0} />
            <Row icon={Tags} label="Categories" value={data?.catCount ?? 0} />
            <Row icon={MapPin} label="Locations" value={data?.locCount ?? 0} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
