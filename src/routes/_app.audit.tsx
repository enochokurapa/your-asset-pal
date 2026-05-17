import { useState } from "react";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { History, Search, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [showCleared, setShowCleared] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-log", showCleared, from, to, entityType],
    queryFn: async () => {
      let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000);
      if (!showCleared) q = q.is("cleared_at", null);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      if (entityType) q = q.eq("entity_type", entityType);
      return (await q).data ?? [];
    },
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
    return [r.entity_type, r.action, actor, r.entity_id].some((v) => v?.toLowerCase().includes(q.toLowerCase()));
  });

  const clearAll = async () => {
    if (!confirm("Archive all currently visible audit entries? This hides them from view (audit history is preserved).")) return;
    const ids = filtered.map((r: any) => r.id);
    const { error } = await supabase.from("audit_log").update({
      cleared_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Archived ${ids.length} entries`);
    qc.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const entityLink = (r: any) => {
    if (!r.entity_id) return null;
    if (r.entity_type === "assets") return `/assets?focus=${r.entity_id}`;
    if (r.entity_type === "asset_movements" || r.entity_type === "asset_assignments" || r.entity_type === "asset_disposals") {
      const aid = r.details?.after?.asset_id ?? r.details?.before?.asset_id ?? r.details?.asset_id;
      return aid ? `/assets?focus=${aid}` : null;
    }
    if (r.entity_type === "approval_requests") return `/dashboard`;
    if (r.entity_type === "branches") return `/branches`;
    if (r.entity_type === "locations") return `/locations`;
    if (r.entity_type === "categories") return `/categories`;
    return null;
  };

  // Friendlier labels for raw action strings produced by the audit trigger
  const friendlyAction = (r: any) => {
    const t = r.entity_type;
    const a = r.action as string;
    if (t === "assets") {
      if (a === "created") return "New asset added";
      if (a === "retired") return "Asset retired";
      if (a === "updated") return "Asset details updated";
      if (a === "deleted") return "Asset removed";
    }
    if (t === "asset_movements" && a === "created") return "Asset movement recorded";
    if (t === "asset_assignments" && a === "created") return "Custodian assigned";
    if (t === "asset_disposals") {
      if (a === "created") return "Retirement / disposal requested";
      if (a === "disposal_approved") return "Disposal approved";
      if (a === "disposal_rejected") return "Disposal rejected";
    }
    if (t === "approval_requests") {
      if (a === "created") return "Approval requested";
      if (a === "updated") return "Approval decided";
    }
    if (t === "branches" || t === "locations" || t === "categories") {
      if (a === "created") return `New ${t.slice(0, -1)} added`;
      if (a === "updated") return `${t.slice(0, -1)} updated`;
    }
    return a.replace(/_/g, " ");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">Every create, update, approval, and retirement action across the system.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={clearAll} className="gap-2">
            <Trash2 className="h-4 w-4" /> Archive visible entries
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search entity, action, user…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All entities</option>
            <option value="assets">Assets</option>
            <option value="asset_movements">Movements</option>
            <option value="asset_disposals">Disposals</option>
            <option value="asset_assignments">Assignments</option>
            <option value="approval_requests">Approvals</option>
            <option value="branches">Branches</option>
            <option value="categories">Categories</option>
            <option value="locations">Locations</option>
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Checkbox id="cleared" checked={showCleared} onCheckedChange={(v) => setShowCleared(!!v)} />
          <label htmlFor="cleared" className="cursor-pointer">Show archived entries</label>
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
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const p = profileMap[r.actor_user_id];
                    const link = entityLink(r);
                    return (
                      <tr key={r.id} className={"border-b last:border-0 " + (r.cleared_at ? "opacity-50" : "")}>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{r.entity_type}</Badge></td>
                        <td className="px-3 py-2">{friendlyAction(r)}</td>
                        <td className="px-3 py-2 text-xs">{p?.full_name ?? p?.email ?? "—"}</td>
                        <td className="px-3 py-2">
                          {link && (
                            <Link to={link} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              Open <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </td>
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
