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
import { submitApproval } from "@/lib/approvals";

const ATTACH_KINDS = [
  { value: "invoice", label: "Invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "warranty", label: "Warranty PDF" },
  { value: "image", label: "Asset image" },
  { value: "other", label: "Other" },
];

export function AssetDetailTabs({ assetId }: { assetId: string }) {
  return (
    <Tabs defaultValue="custody" className="mt-2">
      <TabsList className="w-full">
        <TabsTrigger value="custody" className="flex-1">Custody</TabsTrigger>
        <TabsTrigger value="movements" className="flex-1">Movements</TabsTrigger>
        <TabsTrigger value="attachments" className="flex-1">Files</TabsTrigger>
        <TabsTrigger value="disposal" className="flex-1">Retire/Dispose</TabsTrigger>
        <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="custody"><CustodyPanel assetId={assetId} /></TabsContent>
      <TabsContent value="movements"><MovementsPanel assetId={assetId} /></TabsContent>
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
  const { canWrite, user } = useAuth();
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
      {canWrite && (
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
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["asset-disposals", assetId],
    queryFn: async () => (await supabase.from("asset_disposals").select("*")
      .eq("asset_id", assetId).order("disposal_date", { ascending: false })).data ?? [],
  });
  const [form, setForm] = useState({
    action: "retire" as "retire" | "dispose",
    disposal_reason: "", disposal_date: new Date().toISOString().slice(0, 10),
    disposal_value: "", approval_notes: "",
  });
  const add = async () => {
    if (!form.disposal_reason.trim()) { toast.error("Reason is required"); return; }
    const { error } = await supabase.from("asset_disposals").insert({
      asset_id: assetId,
      disposal_reason: form.disposal_reason.trim(),
      retirement_reason: form.action === "retire" ? form.disposal_reason.trim() : null,
      disposal_date: form.disposal_date,
      disposal_value: form.disposal_value ? Number(form.disposal_value) : null,
      approval_notes: form.approval_notes || null,
      recorded_by: user?.id ?? null,
      status: "pending",
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.action === "retire" ? "Retirement" : "Disposal"} submitted — awaiting admin approval`);
    setForm({ action: form.action, disposal_reason: "", disposal_date: new Date().toISOString().slice(0, 10), disposal_value: "", approval_notes: "" });
    qc.invalidateQueries({ queryKey: ["asset-disposals", assetId] });
  };
  const decide = async (r: any, decision: "approved" | "rejected") => {
    const label = decision === "approved" ? "approval" : "rejection";
    const reason = window.prompt(`Reason for ${label} (optional but recommended):`, "");
    if (reason === null) return;
    const stamp = `[${decision.toUpperCase()} ${new Date().toLocaleString()}${user?.email ? ` by ${user.email}` : ""}]${reason.trim() ? ` ${reason.trim()}` : ""}`;
    const merged = r.approval_notes ? `${r.approval_notes}\n${stamp}` : stamp;
    const { error } = await supabase.from("asset_disposals")
      .update({ status: decision, approved_by: user?.id ?? null, approved_at: new Date().toISOString(), approval_notes: merged } as any)
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    if (decision === "approved") {
      const newStatus = r.retirement_reason ? "retired" : "disposed";
      await supabase.from("assets").update({ status: newStatus }).eq("id", assetId);
      toast.success(`Approved — asset marked as ${newStatus}`);
    } else {
      toast.success("Rejected");
    }
    qc.invalidateQueries({ queryKey: ["asset-disposals", assetId] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Action</Label>
            <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="retire">Retire (end of useful life)</SelectItem>
                <SelectItem value="dispose">Dispose (sold / scrapped)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label>Reason *</Label><Input value={form.disposal_reason} onChange={(e) => setForm({ ...form, disposal_reason: e.target.value })} placeholder="End of life / sold / damaged" /></div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.disposal_date} onChange={(e) => setForm({ ...form, disposal_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Value (UGX)</Label><Input type="number" step="1" value={form.disposal_value} onChange={(e) => setForm({ ...form, disposal_value: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.approval_notes} onChange={(e) => setForm({ ...form, approval_notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Submit for approval</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No retirement / disposal records.</p> :
          data.map((r: any) => {
            const status = r.status ?? "pending";
            const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
            const isPending = status === "pending";
            const canApprove = isAdmin && isPending && r.recorded_by !== user?.id;
            const kind = r.retirement_reason ? "Retirement" : "Disposal";
            return (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.disposal_reason}</p>
                    <Badge variant="outline" className="text-xs">{kind}</Badge>
                    <Badge variant={variant as any} className="capitalize">{status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.disposal_date}{r.disposal_value ? ` · ${formatUGX(r.disposal_value)}` : ""}</p>
                  {r.approval_notes && <p className="mt-1 whitespace-pre-line text-xs">{r.approval_notes}</p>}
                  {r.approved_at && <p className="mt-1 text-xs text-muted-foreground">{status === "approved" ? "Approved" : "Reviewed"} {new Date(r.approved_at).toLocaleDateString()}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {canApprove && (
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
      {canWrite && <p className="text-xs text-muted-foreground">Retirements and disposals require admin approval. You cannot approve a record you submitted.</p>}
    </div>
  );
}

/* ---------- Activity (per-asset audit trail) ---------- */
function ActivityPanel({ assetId }: { assetId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["asset-audit", assetId],
    queryFn: async () => (await supabase.from("audit_log").select("*")
      .eq("entity_type", "assets").eq("entity_id", assetId)
      .order("created_at", { ascending: false })).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name")).data ?? [],
  });
  const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <History className="mx-auto mb-2 h-6 w-6 opacity-40" />
          No activity recorded yet.
        </div>
      ) : data.map((r: any) => {
        const p = profileMap[r.actor_user_id];
        return (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium capitalize">{r.action.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">{p?.full_name ?? p?.email ?? "system"} · {new Date(r.created_at).toLocaleString()}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
