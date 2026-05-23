import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Download, Upload, FileText, Check, X, History, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatUGX } from "@/lib/utils";
import { submitApproval, decideApproval } from "@/lib/approvals";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

function DecideDialog({
  open, status, onCancel, onConfirm,
}: {
  open: boolean;
  status: "approved" | "rejected" | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  // reset reason when dialog opens
  if (!open && reason) setTimeout(() => setReason(""), 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{status === "approved" ? "Reason for approval" : "Reason for rejection"}</DialogTitle>
          <DialogDescription>A short note is required so the requester understands the decision.</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={status === "approved" ? "e.g. Approved — proceed." : "Explain why this is being rejected…"} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            variant={status === "approved" ? "default" : "destructive"}
            disabled={!reason.trim()}
            onClick={async () => { await onConfirm(reason.trim()); setReason(""); }}
          >
            {status === "approved" ? "Approve request" : "Reject request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ATTACH_KINDS = [
  { value: "invoice", label: "Invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "warranty", label: "Warranty PDF" },
  { value: "image", label: "Asset image" },
  { value: "other", label: "Other" },
];

export function AssetDetailTabs({ assetId, defaultTab = "custody" }: { assetId: string; defaultTab?: string }) {
  return (
    <Tabs defaultValue={defaultTab} className="mt-2">
      <TabsList className="w-full flex-wrap">
        <TabsTrigger value="custody" className="flex-1">Custody</TabsTrigger>
        <TabsTrigger value="movements" className="flex-1">Movements</TabsTrigger>
        <TabsTrigger value="maintenance" className="flex-1">Maintenance</TabsTrigger>
        <TabsTrigger value="attachments" className="flex-1">Files</TabsTrigger>
        <TabsTrigger value="disposal" className="flex-1">Retire/Dispose</TabsTrigger>
        <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="custody"><CustodyPanel assetId={assetId} /></TabsContent>
      <TabsContent value="movements"><MovementsPanel assetId={assetId} /></TabsContent>
      <TabsContent value="maintenance"><MaintenancePanel assetId={assetId} /></TabsContent>
      <TabsContent value="attachments"><AttachmentsPanel assetId={assetId} /></TabsContent>
      <TabsContent value="disposal"><DisposalPanel assetId={assetId} /></TabsContent>
      <TabsContent value="activity"><ActivityPanel assetId={assetId} /></TabsContent>
    </Tabs>
  );
}

/* ---------- Custody ---------- */
function CustodyPanel({ assetId }: { assetId: string }) {
  const { canWrite, user } = useAuth();
  const qc = useQueryClient();
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    queryFn: async () => (await supabase.from("branches").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const [form, setForm] = useState({
    assigned_to_name: "", department: "", branch_id: "",
    assignment_date: new Date().toISOString().slice(0, 10),
    return_date: "", notes: "",
  });
  const { data = [] } = useQuery({
    queryKey: ["asset-assignments", assetId],
    queryFn: async () => (await supabase.from("asset_assignments").select("*, branches(name)")
      .eq("asset_id", assetId).order("assignment_date", { ascending: false })).data ?? [],
  });
  const add = async () => {
    if (!form.assigned_to_name.trim() && !form.department.trim()) {
      toast.error("Enter an employee or department"); return;
    }
    const { error } = await supabase.from("asset_assignments").insert({
      asset_id: assetId,
      assigned_to_name: form.assigned_to_name || null,
      department: form.department || null,
      branch_id: form.branch_id || null,
      assignment_date: form.assignment_date,
      return_date: form.return_date || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Assignment added");
    setForm({ assigned_to_name: "", department: "", branch_id: "", assignment_date: new Date().toISOString().slice(0, 10), return_date: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["asset-assignments", assetId] });
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Employee</Label><Input value={form.assigned_to_name} onChange={(e) => setForm({ ...form, assigned_to_name: e.target.value })} placeholder="Jane Doe" /></div>
          <div className="space-y-1"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Finance" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Branch</Label>
            <Select value={form.branch_id || "none"} onValueChange={(v) => setForm({ ...form, branch_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Assigned</Label><Input type="date" value={form.assignment_date} onChange={(e) => setForm({ ...form, assignment_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Return date</Label><Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Add assignment</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No custody records yet.</p> :
          data.map((r: any) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{r.assigned_to_name || "—"} {r.department && <span className="text-muted-foreground">· {r.department}</span>}{r.branches?.name && <span className="text-muted-foreground"> · {r.branches.name}</span>}</p>
              <p className="text-xs text-muted-foreground">From {r.assignment_date}{r.return_date ? ` → ${r.return_date}` : " (open)"}</p>
              {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------- Movements ---------- */
function MovementsPanel({ assetId }: { assetId: string }) {
  const { canWrite, canDo, user } = useAuth();
  const canMove = canWrite || canDo("initiate_movement");
  const qc = useQueryClient();
  const { data: locs = [] } = useQuery({
    queryKey: ["locations-list"],
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    queryFn: async () => (await supabase.from("branches").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const { data = [] } = useQuery({
    queryKey: ["asset-movements", assetId],
    queryFn: async () => (await supabase.from("asset_movements")
      .select("*, from:from_location_id(name), to:to_location_id(name), fromBranch:from_branch_id(name), toBranch:to_branch_id(name)")
      .eq("asset_id", assetId).order("moved_at", { ascending: false })).data ?? [],
  });
  // Current state of the asset (for auto-filled "from" fields)
  const { data: asset } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => (await supabase.from("assets").select("location_id, branch_id").eq("id", assetId).single()).data,
  });
  const { data: currentAssn } = useQuery({
    queryKey: ["asset-current-assn", assetId],
    queryFn: async () => (await supabase.from("asset_assignments")
      .select("assigned_to_name, department, branch_id")
      .eq("asset_id", assetId).order("assignment_date", { ascending: false }).limit(1).maybeSingle()).data,
  });
  const [form, setForm] = useState({
    to_location_id: "", to_branch_id: "", to_user: "", to_department: "",
    moved_at: new Date().toISOString().slice(0, 10), reason: "",
  });
  const from = {
    location_id: asset?.location_id ?? "",
    branch_id: currentAssn?.branch_id ?? asset?.branch_id ?? "",
    user: currentAssn?.assigned_to_name ?? "",
    department: currentAssn?.department ?? "",
  };
  const locName = (id: string) => locs.find((l: any) => l.id === id)?.name ?? "—";
  const brName = (id: string) => branches.find((b: any) => b.id === id)?.name ?? "—";

  const add = async () => {
    if (!form.to_location_id && !form.to_branch_id && !form.to_user.trim()) {
      toast.error("Choose a destination location, branch or person"); return;
    }
    const transfer_type = from.branch_id && form.to_branch_id && from.branch_id !== form.to_branch_id ? "external" : "internal";
    try {
      await submitApproval({
        kind: "movement",
        assetId,
        reason: form.reason || undefined,
        payload: {
          from_location_id: from.location_id || null,
          to_location_id: form.to_location_id || null,
          from_branch_id: from.branch_id || null,
          to_branch_id: form.to_branch_id || null,
          from_user: from.user || null,
          to_user: form.to_user || null,
          to_department: form.to_department || null,
          transfer_type,
          moved_at: form.moved_at,
          reason: form.reason || null,
        },
      });
      setForm({ to_location_id: "", to_branch_id: "", to_user: "", to_department: "", moved_at: new Date().toISOString().slice(0, 10), reason: "" });
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };
  return (
    <div className="space-y-3">
      {canMove && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="rounded-md bg-muted/40 p-2 text-xs sm:col-span-2">
            <p className="font-medium text-muted-foreground">Currently with</p>
            <p className="mt-1">{from.user || "—"}{from.department ? ` · ${from.department}` : ""} · {brName(from.branch_id)} · {locName(from.location_id)}</p>
          </div>
          <div className="space-y-1"><Label>To location</Label>
            <Select value={form.to_location_id || "none"} onValueChange={(v) => setForm({ ...form, to_location_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {locs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>To branch</Label>
            <Select value={form.to_branch_id || "none"} onValueChange={(v) => setForm({ ...form, to_branch_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>To person</Label><Input value={form.to_user} onChange={(e) => setForm({ ...form, to_user: e.target.value })} placeholder="New custodian" /></div>
          <div className="space-y-1"><Label>To department</Label><Input value={form.to_department} onChange={(e) => setForm({ ...form, to_department: e.target.value })} placeholder="Finance" /></div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.moved_at} onChange={(e) => setForm({ ...form, moved_at: e.target.value })} /></div>
          <div className="space-y-1"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Office relocation / inter-branch transfer" /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={add}><Send className="mr-1 h-4 w-4" />Request movement (admin approval)</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No movements recorded.</p> :
          data.map((r: any) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <p className="font-medium">{r.from?.name ?? r.fromBranch?.name ?? "—"} → {r.to?.name ?? r.toBranch?.name ?? "—"}</p>
                <Badge variant="outline" className="text-xs capitalize">{r.transfer_type ?? "internal"}</Badge>
              </div>
              {(r.from_user || r.to_user) && <p className="text-xs text-muted-foreground">Custody: {r.from_user ?? "—"} → {r.to_user ?? "—"}</p>}
              {(r.fromBranch?.name || r.toBranch?.name) && <p className="text-xs text-muted-foreground">Branch: {r.fromBranch?.name ?? "—"} → {r.toBranch?.name ?? "—"}</p>}
              <p className="text-xs text-muted-foreground">{r.moved_at}{r.reason ? ` · ${r.reason}` : ""}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------- Attachments ---------- */
function AttachmentsPanel({ assetId }: { assetId: string }) {
  const { canWrite, user } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState("invoice");
  const [uploading, setUploading] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["asset-attachments", assetId],
    queryFn: async () => (await supabase.from("asset_attachments").select("*")
      .eq("asset_id", assetId).order("created_at", { ascending: false })).data ?? [],
  });
  const upload = async (file: File) => {
    setUploading(true);
    const path = `${assetId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("asset-files").upload(path, file);
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { error } = await supabase.from("asset_attachments").insert({
      asset_id: assetId, kind, file_name: file.name, storage_path: path,
      mime_type: file.type, uploaded_by: user?.id ?? null,
    });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("File uploaded");
    qc.invalidateQueries({ queryKey: ["asset-attachments", assetId] });
  };
  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("asset-files").createSignedUrl(path, 60);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click();
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{ATTACH_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>File</Label>
            <Input type="file" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </div>
          {uploading && <span className="text-xs text-muted-foreground"><Upload className="mr-1 inline h-3 w-3" />Uploading…</span>}
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No files attached.</p> :
          data.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.file_name}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.kind}</p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => download(r.storage_path, r.file_name)}><Download className="h-4 w-4" /></Button>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------- Disposal / Retirement ---------- */
function DisposalPanel({ assetId }: { assetId: string }) {
  const { canDo, canApprove, user } = useAuth();
  const qc = useQueryClient();
  const canRetire = canDo("initiate_retirement");
  const canDispose = canDo("initiate_disposal");
  const canInitiate = canRetire || canDispose;

  // Pending/decided requests for this asset (retirement + disposal)
  const { data = [] } = useQuery({
    queryKey: ["asset-approvals", assetId],
    queryFn: async () => (await supabase.from("approval_requests")
      .select("*")
      .eq("asset_id", assetId)
      .in("kind", ["retirement", "disposal"])
      .order("created_at", { ascending: false })).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));

  const defaultAction: "retire" | "dispose" = canRetire ? "retire" : "dispose";
  const [form, setForm] = useState({
    action: defaultAction,
    reason: "",
    notes: "",
    disposal_value: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const submit = async () => {
    if (!form.reason.trim()) { toast.error("Reason is required"); return; }
    const kind = form.action === "retire" ? "retirement" : "disposal";
    if (form.action === "retire" && !canRetire) { toast.error("You don't have permission to request retirement"); return; }
    if (form.action === "dispose" && !canDispose) { toast.error("You don't have permission to request disposal"); return; }
    try {
      await submitApproval({
        kind,
        assetId,
        reason: form.reason.trim(),
        payload: {
          notes: form.notes || null,
          disposal_value: form.disposal_value ? Number(form.disposal_value) : null,
          date: form.date,
        },
      });
      setForm({ action: form.action, reason: "", notes: "", disposal_value: "", date: new Date().toISOString().slice(0, 10) });
      qc.invalidateQueries({ queryKey: ["asset-approvals", assetId] });
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const [pending, setPending] = useState<{ r: any; status: "approved" | "rejected" } | null>(null);
  const decide = (r: any, decision: "approved" | "rejected") => setPending({ r, status: decision });
  const confirmDecide = async (reason: string) => {
    if (!pending) return;
    try {
      await decideApproval(pending.r.id, pending.status, reason);
      qc.invalidateQueries({ queryKey: ["asset-approvals", assetId] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    setPending(null);
  };

  return (
    <div className="space-y-3">
      {canInitiate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Action</Label>
            <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {canRetire && <SelectItem value="retire">Retire (end of useful life)</SelectItem>}
                {canDispose && <SelectItem value="dispose">Dispose (sold / scrapped)</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label>Reason *</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="End of life / sold / damaged" /></div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Value (UGX)</Label><Input type="number" step="1" value={form.disposal_value} onChange={(e) => setForm({ ...form, disposal_value: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={submit}><Send className="mr-1 h-4 w-4" />Submit for approval</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No retirement / disposal requests.</p> :
          data.map((r: any) => {
            const status = r.status ?? "pending";
            const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
            const isPending = status === "pending";
            const kindLabel = r.kind === "retirement" ? "Retirement" : "Disposal";
            const mayDecide = isPending && canApprove(r.kind) && r.requested_by !== user?.id;
            const requester = profileMap[r.requested_by];
            const p = r.payload ?? {};
            return (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.reason ?? "—"}</p>
                    <Badge variant="outline" className="text-xs">{kindLabel}</Badge>
                    <Badge variant={variant as any} className="capitalize">{status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.date ?? new Date(r.created_at).toLocaleDateString()}
                    {p.disposal_value ? ` · ${formatUGX(p.disposal_value)}` : ""}
                    {requester ? ` · by ${requester.full_name ?? requester.email}` : ""}
                  </p>
                  {p.notes && <p className="mt-1 whitespace-pre-line text-xs">{p.notes}</p>}
                  {r.decided_at && <p className="mt-1 text-xs text-muted-foreground">{status === "approved" ? "Approved" : "Reviewed"} {new Date(r.decided_at).toLocaleString()}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {mayDecide && (
                    <>
                      <Button size="icon" variant="ghost" title="Approve" onClick={() => decide(r, "approved")}><Check className="h-4 w-4 text-green-600" /></Button>
                      <Button size="icon" variant="ghost" title="Reject" onClick={() => decide(r, "rejected")}><X className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      {canInitiate && <p className="text-xs text-muted-foreground">Requests are routed to users granted approval rights by the admin. You cannot approve your own request.</p>}
      {!canInitiate && <p className="text-xs text-muted-foreground">You don't have permission to initiate retirement or disposal. Ask an admin to grant you the right.</p>}
      <DecideDialog open={!!pending} status={pending?.status ?? null} onCancel={() => setPending(null)} onConfirm={confirmDecide} />
    </div>
  );
}

/* ---------- Maintenance ---------- */
function MaintenancePanel({ assetId }: { assetId: string }) {
  const { canDo, canApprove, user } = useAuth();
  const canRequest = canDo("initiate_maintenance");
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["asset-maintenance", assetId],
    queryFn: async () => (await supabase.from("approval_requests")
      .select("*").eq("asset_id", assetId).eq("kind", "maintenance")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));

  const [form, setForm] = useState({
    issue: "", priority: "normal", scheduled_for: "", estimated_cost: "", notes: "",
  });

  const submit = async () => {
    if (!form.issue.trim()) { toast.error("Describe the issue"); return; }
    try {
      await submitApproval({
        kind: "maintenance",
        assetId,
        reason: form.issue.trim(),
        payload: {
          priority: form.priority,
          scheduled_for: form.scheduled_for || null,
          estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
          notes: form.notes || null,
        },
      });
      setForm({ issue: "", priority: "normal", scheduled_for: "", estimated_cost: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["asset-maintenance", assetId] });
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const decide = async (r: any, decision: "approved" | "rejected") => {
    const { decideApproval } = await import("@/lib/approvals");
    const reason = decision === "rejected"
      ? window.prompt("Reason for rejection:", "") ?? undefined
      : window.prompt("Approval note (optional):", "") ?? undefined;
    try {
      await decideApproval(r.id, decision, reason);
      qc.invalidateQueries({ queryKey: ["asset-maintenance", assetId] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <div className="space-y-3">
      {canRequest && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Issue *</Label><Input value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} placeholder="Screen flickering / not powering on" /></div>
          <div className="space-y-1"><Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Scheduled for</Label><Input type="date" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Estimated cost (UGX)</Label><Input type="number" step="1" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={submit}><Send className="mr-1 h-4 w-4" />Submit maintenance requisition</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No maintenance requests.</p> :
          data.map((r: any) => {
            const status = r.status ?? "pending";
            const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
            const isPending = status === "pending";
            const mayDecide = isPending && canApprove("maintenance") && r.requested_by !== user?.id;
            const requester = profileMap[r.requested_by];
            const p = r.payload ?? {};
            return (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.reason ?? "—"}</p>
                    {p.priority && <Badge variant="outline" className="text-xs capitalize">{p.priority}</Badge>}
                    <Badge variant={variant as any} className="capitalize">{status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.scheduled_for ? `Scheduled ${p.scheduled_for}` : new Date(r.created_at).toLocaleDateString()}
                    {p.estimated_cost ? ` · ${formatUGX(p.estimated_cost)}` : ""}
                    {requester ? ` · by ${requester.full_name ?? requester.email}` : ""}
                  </p>
                  {p.notes && <p className="mt-1 whitespace-pre-line text-xs">{p.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {mayDecide && (
                    <>
                      <Button size="icon" variant="ghost" title="Approve" onClick={() => decide(r, "approved")}><Check className="h-4 w-4 text-green-600" /></Button>
                      <Button size="icon" variant="ghost" title="Reject" onClick={() => decide(r, "rejected")}><X className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      {!canRequest && <p className="text-xs text-muted-foreground">You don't have permission to raise maintenance requisitions. Ask an admin to grant the right.</p>}
    </div>
  );
}

/* ---------- Activity (per-asset audit trail, visible to everyone) ---------- */
function ActivityPanel({ assetId }: { assetId: string }) {
  const { data: movements = [] } = useQuery({
    queryKey: ["activity-movements", assetId],
    queryFn: async () => (await supabase.from("asset_movements")
      .select("*, from:from_location_id(name), to:to_location_id(name), fromBranch:from_branch_id(name), toBranch:to_branch_id(name)")
      .eq("asset_id", assetId)).data ?? [],
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["activity-assignments", assetId],
    queryFn: async () => (await supabase.from("asset_assignments").select("*, branches(name)").eq("asset_id", assetId)).data ?? [],
  });
  const { data: approvals = [] } = useQuery({
    queryKey: ["activity-approvals", assetId],
    queryFn: async () => (await supabase.from("approval_requests").select("*").eq("asset_id", assetId)).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const pm = Object.fromEntries(profiles.map((p: any) => [p.id, p.full_name ?? p.email]));

  type Ev = { id: string; ts: string; title: string; subtitle?: string; reason?: string; tone?: string };
  const events: Ev[] = [];
  for (const m of movements as any[]) {
    events.push({
      id: `mv-${m.id}`, ts: m.moved_at ?? m.created_at,
      title: `Moved: ${m.from?.name ?? m.fromBranch?.name ?? "—"} → ${m.to?.name ?? m.toBranch?.name ?? "—"}`,
      subtitle: `${m.transfer_type ?? "internal"}${m.from_user || m.to_user ? ` · custody ${m.from_user ?? "—"} → ${m.to_user ?? "—"}` : ""} · by ${pm[m.moved_by] ?? "—"}`,
      reason: m.reason ?? undefined,
    });
  }
  for (const a of assignments as any[]) {
    events.push({
      id: `as-${a.id}`, ts: a.assignment_date ?? a.created_at,
      title: `Assigned to ${a.assigned_to_name ?? a.department ?? "—"}`,
      subtitle: `${a.branches?.name ? a.branches.name + " · " : ""}${a.return_date ? `until ${a.return_date}` : "open"} · by ${pm[a.created_by] ?? "—"}`,
      reason: a.notes ?? undefined,
    });
  }
  for (const r of approvals as any[]) {
    const kindLabel = String(r.kind).replace(/_/g, " ");
    events.push({
      id: `ap-${r.id}`, ts: r.decided_at ?? r.created_at,
      title: `${kindLabel} request ${r.status}`,
      subtitle: `requested by ${pm[r.requested_by] ?? "—"}${r.approver_id ? ` · decided by ${pm[r.approver_id] ?? "—"}` : ""}`,
      reason: r.reason ?? undefined,
      tone: r.status === "approved" ? "text-green-600" : r.status === "rejected" ? "text-destructive" : "text-muted-foreground",
    });
  }
  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="space-y-2">
      {events.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <History className="mx-auto mb-2 h-6 w-6 opacity-40" />
          No activity recorded yet.
        </div>
      ) : events.map((e) => (
        <div key={e.id} className="rounded-lg border p-3 text-sm">
          <p className={`font-medium capitalize ${e.tone ?? ""}`}>{e.title}</p>
          {e.subtitle && <p className="text-xs text-muted-foreground">{e.subtitle} · {new Date(e.ts).toLocaleString()}</p>}
          {e.reason && <p className="mt-1 whitespace-pre-line text-xs"><span className="text-muted-foreground">Reason: </span>{e.reason}</p>}
        </div>
      ))}
    </div>
  );
}
