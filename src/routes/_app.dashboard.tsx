import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, CheckCircle2, Wrench, Archive, Tags, MapPin, Building2, AlertTriangle, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { PendingApprovalsCard } from "@/components/pending-approvals-card";
import { TileAssetsDialog, type TileFilter } from "@/components/tile-assets-dialog";

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
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [assets, cats, locs, branches] = await Promise.all([
        supabase.from("assets").select("id,status,name,asset_tag,branch_id,set_for_disposal,created_at").order("created_at", { ascending: false }),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("locations").select("id", { count: "exact", head: true }),
        supabase.from("branches").select("id,name,code,is_active"),
      ]);
      const list = assets.data ?? [];
      const branchList = branches.data ?? [];
      const perBranch = branchList.map((b: any) => ({
        ...b,
        assetCount: list.filter((a: any) => a.branch_id === b.id).length,
      }));
      const statusCounts = ["in_use", "in_storage", "under_repair", "retired", "missing", "disposed"].map((s) => ({
        name: s.replace("_", " "),
        key: s,
        value: list.filter((a: any) => a.status === s).length,
      }));
      return {
        total: list.length,
        active: list.filter((a: any) => a.status !== "disposed" && a.status !== "retired" && a.status !== "under_repair" && a.status !== "missing").length,
        inUse: list.filter((a) => a.status === "in_use").length,
        repair: list.filter((a) => a.status === "under_repair").length,
        retired: list.filter((a) => a.status === "retired").length,
        disposed: list.filter((a: any) => a.status === "disposed").length,
        missing: list.filter((a) => a.status === "missing").length,
        forDisposal: list.filter((a: any) => a.set_for_disposal).length,
        catCount: cats.count ?? 0,
        locCount: locs.count ?? 0,
        branchCount: branchList.length,
        perBranch,
        statusCounts,
      };
    },
  });

  const stats = [
    { label: "Total Assets", value: data?.total ?? 0, icon: Package, tone: "text-primary bg-primary/10" },
    { label: "Active Assets", value: data?.active ?? 0, icon: CheckCircle2, tone: "text-success bg-success/10" },
    { label: "Branches", value: data?.branchCount ?? 0, icon: Building2, tone: "text-primary bg-primary/10" },
    { label: "In Use", value: data?.inUse ?? 0, icon: CheckCircle2, tone: "text-success bg-success/10" },
    { label: "Under Repair", value: data?.repair ?? 0, icon: Wrench, tone: "text-warning bg-warning/15" },
    { label: "Retired", value: data?.retired ?? 0, icon: Archive, tone: "text-muted-foreground bg-muted" },
    { label: "Disposed", value: data?.disposed ?? 0, icon: Trash2, tone: "text-muted-foreground bg-muted" },
    { label: "Missing", value: data?.missing ?? 0, icon: AlertTriangle, tone: "text-destructive bg-destructive/10" },
    { label: "For Disposal", value: data?.forDisposal ?? 0, icon: Trash2, tone: "text-warning bg-warning/15" },
  ];

  const pieData = (data?.statusCounts ?? []).filter((s) => s.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your fixed assets across all branches.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{isLoading ? "—" : s.value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tone}`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

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
