import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, CheckCircle2, Wrench, Archive, DollarSign, Tags, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [assets, cats, locs] = await Promise.all([
        supabase.from("assets").select("id,status,purchase_value,name,asset_tag,created_at").order("created_at", { ascending: false }),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("locations").select("id", { count: "exact", head: true }),
      ]);
      const list = assets.data ?? [];
      return {
        total: list.length,
        inUse: list.filter((a) => a.status === "in_use").length,
        repair: list.filter((a) => a.status === "under_repair").length,
        retired: list.filter((a) => a.status === "retired").length,
        value: list.reduce((s, a) => s + Number(a.purchase_value ?? 0), 0),
        catCount: cats.count ?? 0,
        locCount: locs.count ?? 0,
        recent: list.slice(0, 5),
      };
    },
  });

  const stats = [
    { label: "Total Assets", value: data?.total ?? 0, icon: Package, tone: "text-primary bg-primary/10" },
    { label: "In Use", value: data?.inUse ?? 0, icon: CheckCircle2, tone: "text-success bg-success/10" },
    { label: "Under Repair", value: data?.repair ?? 0, icon: Wrench, tone: "text-warning bg-warning/15" },
    { label: "Retired", value: data?.retired ?? 0, icon: Archive, tone: "text-muted-foreground bg-muted" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your fixed assets.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <h2 className="text-sm font-semibold">Recently added</h2>
          <div className="mt-4 divide-y">
            {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && data?.recent.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No assets yet.</p>
            )}
            {data?.recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.asset_tag}</p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {a.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Portfolio</h2>
          <div className="mt-4 space-y-4">
            <Row icon={DollarSign} label="Total value" value={`$${(data?.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
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
