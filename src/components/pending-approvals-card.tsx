import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("*, asset:assets(name, asset_tag), requester:profiles!approval_requests_requested_by_fkey(full_name,email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

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
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pending approvals</h2>
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
                  <DropdownMenuItem disabled={!allowed} onClick={() => allowed && handleDecide(r.id, "approved")}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!allowed} onClick={() => { if (!allowed) return; setRejectReason(""); setRejectOpen(r.id); }}>
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

      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reason for rejection</DialogTitle></DialogHeader>
          <Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this request is being rejected…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                if (rejectOpen) await handleDecide(rejectOpen, "rejected", rejectReason.trim());
                setRejectOpen(null);
              }}
            >Reject request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
