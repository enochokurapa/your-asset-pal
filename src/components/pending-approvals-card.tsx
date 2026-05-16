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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, CheckCircle2, XCircle, Eye } from "lucide-react";
import { decideApproval } from "@/lib/approvals";
import { useAuth } from "@/hooks/use-auth";

export function PendingApprovalsCard() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("*, asset:assets(name, asset_tag)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const handleDecide = async (id: string, status: "approved" | "rejected", reason?: string) => {
    await decideApproval(id, status, reason);
    qc.invalidateQueries({ queryKey: ["pending-approvals"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
        {rows.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">{r.kind.replace("_", " ")}</Badge>
                <p className="truncate text-sm font-medium">{r.asset?.name ?? "—"}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.asset?.asset_tag ?? ""} · {new Date(r.created_at).toLocaleString()}
              </p>
              {r.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">"{r.reason}"</p>}
            </div>
            {canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Action <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDecide(r.id, "approved")}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alert(JSON.stringify(r.payload, null, 2))}>
                    <Eye className="mr-2 h-4 w-4" /> Review details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setRejectReason(""); setRejectOpen(r.id); }}>
                    <XCircle className="mr-2 h-4 w-4 text-destructive" /> Reject…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

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
