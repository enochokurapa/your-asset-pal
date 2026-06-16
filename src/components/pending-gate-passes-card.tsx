import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DoorOpen } from "lucide-react";

export function PendingGatePassesCard() {
  const { canSeeBranch } = useAuth();
  const nav = useNavigate();

  const { data: rows = [] } = useQuery({
    queryKey: ["dashboard-gate-passes"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("gate_passes")
        .select("*")
        .in("status", ["pending", "approved", "checked_out"])
        .order("created_at", { ascending: false })
        .limit(50);
      const list = (data ?? []).filter((r: any) => canSeeBranch(r.branch_id));
      const assetIds = Array.from(new Set(list.map((r: any) => r.asset_id).filter(Boolean))) as string[];
      const userIds = Array.from(new Set(list.map((r: any) => r.requested_by).filter(Boolean))) as string[];
      const [{ data: assets }, { data: profs }] = await Promise.all([
        assetIds.length ? supabase.from("assets").select("id,name,asset_tag").in("id", assetIds) : Promise.resolve({ data: [] as any[] }),
        userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const aMap = Object.fromEntries((assets ?? []).map((a: any) => [a.id, a]));
      const pMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((r: any) => ({ ...r, asset: aMap[r.asset_id], requester: pMap[r.requested_by] }));
    },
    refetchInterval: 15000,
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <DoorOpen className="h-4 w-4" /> Gate pass requests
        </h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="mt-4 divide-y">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No active gate passes.</p>
        )}
        {rows.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between py-3 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase">{r.status.replace(/_/g, " ")}</Badge>
                {r.pass_number && <span className="font-mono text-xs">{r.pass_number}</span>}
                <p className="truncate text-sm font-medium">{r.asset?.name ?? "—"}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {r.asset?.asset_tag ?? ""} · to {r.destination ?? "—"} · by {r.requester?.full_name || r.requester?.email || "user"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => nav({ to: "/gate-pass" })}>Open</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
