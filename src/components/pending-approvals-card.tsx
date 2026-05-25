import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, CheckCircle2, XCircle, Eye } from "lucide-react";
import { decideApproval } from "@/lib/approvals";
import { useAuth, ApprovalKind } from "@/hooks/use-auth";

export function PendingApprovalsCard() {
  const { canApprove, user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [decideOpen, setDecideOpen] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [decideReason, setDecideReason] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      const list = data ?? [];
      const userIds = Array.from(new Set(list.map((r: any) => r.requested_by).filter(Boolean)));
      const assetIds = Array.from(new Set(list.map((r: any) => r.asset_id).filter(Boolean)));
      const [profsRes, assetsRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
        assetIds.length ? supabase.from("assets").select("id,name,asset_tag").in("id", assetIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const profMap = Object.fromEntries(((profsRes as any).data ?? []).map((p: any) => [p.id, p]));
      const assetMap = Object.fromEntries(((assetsRes as any).data ?? []).map((a: any) => [a.id, a]));
      return list.map((r: any) => ({ ...r, requester: profMap[r.requested_by] ?? null, asset: assetMap[r.asset_id] ?? null }));
    },
    refetchInterval: 10000,
  });

  // Deep link: /dashboard?approval=<id>&action=approve|reject|view
  const search = location.search as any;
  const approvalId: string | undefined = search?.approval;
  const action: string | undefined = search?.action;
  useEffect(() => {
    if (!approvalId) return;
    let cancelled = false;
    (async () => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      let row: any = rows.find((r: any) => r.id === approvalId);
      if (!row) {
        // Possibly already decided — fetch directly
        const { data } = await supabase.from("approval_requests").select("*").eq("id", approvalId).maybeSingle();
        if (!data) { nav({ to: "/dashboard", search: {} as any, replace: true }); return; }
        const [{ data: prof }, { data: asset }] = await Promise.all([
          data.requested_by ? supabase.from("profiles").select("id,full_name,email").eq("id", data.requested_by).maybeSingle() : Promise.resolve({ data: null }),
          data.asset_id ? supabase.from("assets").select("id,name,asset_tag").eq("id", data.asset_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        row = { ...data, requester: prof, asset };
      }
      if (cancelled) return;
      const isPending = row.status === "pending";
      if (isPending && (action === "approve" || action === "reject")) {
        const allowed = canApprove(row.kind) && row.requested_by !== user?.id;
        if (allowed) {
          setDecideReason("");
          setDecideOpen({ id: row.id, status: action === "approve" ? "approved" : "rejected" });
        } else {
          setDetail(row);
        }
      } else {
        setDetail(row);
      }
      nav({ to: "/dashboard", search: {} as any, replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalId, action]);


  const handleDecide = async (id: string, status: "approved" | "rejected", reason?: string) => {
    try {
      await decideApproval(id, status, reason);
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-detail"] });
    } catch (e: any) {
      // toast already handled inside decideApproval on success; surface failures
      console.error(e);
    }
  };

  return (
    <Card className="p-5" ref={cardRef as any}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pending approvals &amp; requisitions</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="mt-4 divide-y">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting for approval.</p>
        )}
        {rows.map((r: any) => {
          const kind = r.kind as ApprovalKind;
          const isOwn = r.requested_by === user?.id;
          const allowed = canApprove(kind) && !isOwn;
          return (
            <div key={r.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">{r.kind.replace(/_/g, " ")}</Badge>
                  <p className="truncate text-sm font-medium">{r.asset?.name ?? "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.asset?.asset_tag ?? ""} · by {r.requester?.full_name || r.requester?.email || "user"} · {new Date(r.created_at).toLocaleString()}
                </p>
                {r.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">"{r.reason}"</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Action <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDetail(r)}>
                    <Eye className="mr-2 h-4 w-4" /> Review details
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!allowed} onClick={() => { if (!allowed) return; setDecideReason(""); setDecideOpen({ id: r.id, status: "approved" }); }}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve…
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!allowed} onClick={() => { if (!allowed) return; setDecideReason(""); setDecideOpen({ id: r.id, status: "rejected" }); }}>
                    <XCircle className="mr-2 h-4 w-4 text-destructive" /> Reject…
                  </DropdownMenuItem>
                  {!allowed && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      {isOwn ? "You can't decide your own request" : "You don't have rights to approve this kind"}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{detail?.kind?.replace(/_/g, " ")} request</DialogTitle>
            <DialogDescription>
              {detail?.asset?.name} {detail?.asset?.asset_tag ? `(${detail.asset.asset_tag})` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Requested by</p>
                <p>{detail.requester?.full_name || detail.requester?.email || "—"} · {new Date(detail.created_at).toLocaleString()}</p>
              </div>
              {detail.reason && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Reason</p>
                  <p className="whitespace-pre-line">{detail.reason}</p>
                </div>
              )}
              {detail.payload && Object.keys(detail.payload).length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Details</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(detail.payload, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decideOpen} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideOpen?.status === "approved" ? "Reason for approval" : "Reason for rejection"}
            </DialogTitle>
            <DialogDescription>
              A short note is required so the requester understands the decision.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={decideReason} onChange={(e) => setDecideReason(e.target.value)}
            placeholder={decideOpen?.status === "approved"
              ? "e.g. Approved — proceed with the transfer."
              : "Explain why this request is being rejected…"} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOpen(null)}>Cancel</Button>
            <Button
              variant={decideOpen?.status === "approved" ? "default" : "destructive"}
              disabled={!decideReason.trim()}
              onClick={async () => {
                if (decideOpen) await handleDecide(decideOpen.id, decideOpen.status, decideReason.trim());
                setDecideOpen(null);
              }}
            >
              {decideOpen?.status === "approved" ? "Approve request" : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
