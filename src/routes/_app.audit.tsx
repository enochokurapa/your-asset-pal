import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { History, Search } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { canWrite } = useAuth();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => (await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));

  if (!canWrite) return <Navigate to="/dashboard" />;

  const filtered = rows.filter((r: any) => {
    if (!q) return true;
    const actor = profileMap[r.actor_user_id]?.email ?? "";
    return [r.entity_type, r.action, actor].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground">Every create, update, approval, and retirement action across the system.</p>
      </div>
      <Card className="p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Filter by entity, action or user…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> :
          filtered.length === 0 ? (
            <div className="py-12 text-center">
              <History className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No audit entries.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">By</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const p = profileMap[r.actor_user_id];
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{r.entity_type}</Badge></td>
                        <td className="px-3 py-2 capitalize">{r.action.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 text-xs">{p?.full_name ?? p?.email ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
