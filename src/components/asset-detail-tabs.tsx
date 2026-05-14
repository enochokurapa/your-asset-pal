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
import { Plus, Trash2, Download, Upload, FileText, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
        <TabsTrigger value="disposal" className="flex-1">Disposal</TabsTrigger>
      </TabsList>
      <TabsContent value="custody"><CustodyPanel assetId={assetId} /></TabsContent>
      <TabsContent value="movements"><MovementsPanel assetId={assetId} /></TabsContent>
      <TabsContent value="attachments"><AttachmentsPanel assetId={assetId} /></TabsContent>
      <TabsContent value="disposal"><DisposalPanel assetId={assetId} /></TabsContent>
    </Tabs>
  );
}

/* ---------- Custody ---------- */
function CustodyPanel({ assetId }: { assetId: string }) {
  const { canWrite, user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    assigned_to_name: "", department: "", assignment_date: new Date().toISOString().slice(0, 10),
    return_date: "", notes: "",
  });
  const { data = [] } = useQuery({
    queryKey: ["asset-assignments", assetId],
    queryFn: async () => (await supabase.from("asset_assignments").select("*")
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
      assignment_date: form.assignment_date,
      return_date: form.return_date || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Assignment added");
    setForm({ assigned_to_name: "", department: "", assignment_date: new Date().toISOString().slice(0, 10), return_date: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["asset-assignments", assetId] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    const { error } = await supabase.from("asset_assignments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["asset-assignments", assetId] });
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Employee</Label><Input value={form.assigned_to_name} onChange={(e) => setForm({ ...form, assigned_to_name: e.target.value })} placeholder="Jane Doe" /></div>
          <div className="space-y-1"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Finance" /></div>
          <div className="space-y-1"><Label>Assigned</Label><Input type="date" value={form.assignment_date} onChange={(e) => setForm({ ...form, assignment_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Return date</Label><Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Add assignment</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No custody records yet.</p> :
          data.map((r: any) => (
            <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{r.assigned_to_name || "—"} {r.department && <span className="text-muted-foreground">· {r.department}</span>}</p>
                <p className="text-xs text-muted-foreground">From {r.assignment_date}{r.return_date ? ` → ${r.return_date}` : " (open)"}</p>
                {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
              </div>
              {canWrite && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
  const { data = [] } = useQuery({
    queryKey: ["asset-movements", assetId],
    queryFn: async () => (await supabase.from("asset_movements")
      .select("*, from:from_location_id(name), to:to_location_id(name)")
      .eq("asset_id", assetId).order("moved_at", { ascending: false })).data ?? [],
  });
  const [form, setForm] = useState({
    from_location_id: "", to_location_id: "",
    moved_at: new Date().toISOString().slice(0, 10), reason: "",
  });
  const add = async () => {
    if (!form.to_location_id) { toast.error("Choose a destination location"); return; }
    const { error } = await supabase.from("asset_movements").insert({
      asset_id: assetId,
      from_location_id: form.from_location_id || null,
      to_location_id: form.to_location_id,
      moved_at: form.moved_at,
      reason: form.reason || null,
      moved_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    // Update asset's current location
    await supabase.from("assets").update({ location_id: form.to_location_id }).eq("id", assetId);
    toast.success("Movement recorded");
    setForm({ from_location_id: "", to_location_id: "", moved_at: new Date().toISOString().slice(0, 10), reason: "" });
    qc.invalidateQueries({ queryKey: ["asset-movements", assetId] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this movement?")) return;
    await supabase.from("asset_movements").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["asset-movements", assetId] });
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>From</Label>
            <Select value={form.from_location_id || "none"} onValueChange={(v) => setForm({ ...form, from_location_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {locs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>To *</Label>
            <Select value={form.to_location_id} onValueChange={(v) => setForm({ ...form, to_location_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {locs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.moved_at} onChange={(e) => setForm({ ...form, moved_at: e.target.value })} /></div>
          <div className="space-y-1"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Office relocation" /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Record movement</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No movements recorded.</p> :
          data.map((r: any) => (
            <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{r.from?.name ?? "—"} → {r.to?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{r.moved_at}{r.reason ? ` · ${r.reason}` : ""}</p>
              </div>
              {canWrite && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
  const remove = async (id: string, path: string) => {
    if (!confirm("Delete this file?")) return;
    await supabase.storage.from("asset-files").remove([path]);
    await supabase.from("asset_attachments").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["asset-attachments", assetId] });
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
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => download(r.storage_path, r.file_name)}><Download className="h-4 w-4" /></Button>
                {canWrite && <Button size="icon" variant="ghost" onClick={() => remove(r.id, r.storage_path)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------- Disposal ---------- */
function DisposalPanel({ assetId }: { assetId: string }) {
  const { canWrite, user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["asset-disposals", assetId],
    queryFn: async () => (await supabase.from("asset_disposals").select("*")
      .eq("asset_id", assetId).order("disposal_date", { ascending: false })).data ?? [],
  });
  const [form, setForm] = useState({
    disposal_reason: "", disposal_date: new Date().toISOString().slice(0, 10),
    disposal_value: "", approval_notes: "",
  });
  const add = async () => {
    if (!form.disposal_reason.trim()) { toast.error("Reason is required"); return; }
    const { error } = await supabase.from("asset_disposals").insert({
      asset_id: assetId,
      disposal_reason: form.disposal_reason.trim(),
      disposal_date: form.disposal_date,
      disposal_value: form.disposal_value ? Number(form.disposal_value) : null,
      approval_notes: form.approval_notes || null,
      recorded_by: user?.id ?? null,
      status: "pending",
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Disposal submitted — awaiting approval");
    setForm({ disposal_reason: "", disposal_date: new Date().toISOString().slice(0, 10), disposal_value: "", approval_notes: "" });
    qc.invalidateQueries({ queryKey: ["asset-disposals", assetId] });
  };
  const approve = async (id: string) => {
    const { error } = await supabase.from("asset_disposals")
      .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("assets").update({ status: "disposed" }).eq("id", assetId);
    toast.success("Disposal approved — asset marked as disposed");
    qc.invalidateQueries({ queryKey: ["asset-disposals", assetId] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };
  const reject = async (id: string) => {
    if (!confirm("Reject this disposal request?")) return;
    const { error } = await supabase.from("asset_disposals")
      .update({ status: "rejected", approved_by: user?.id ?? null, approved_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Disposal rejected");
    qc.invalidateQueries({ queryKey: ["asset-disposals", assetId] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this disposal record?")) return;
    await supabase.from("asset_disposals").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["asset-disposals", assetId] });
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Reason *</Label><Input value={form.disposal_reason} onChange={(e) => setForm({ ...form, disposal_reason: e.target.value })} placeholder="End of life / sold / damaged" /></div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.disposal_date} onChange={(e) => setForm({ ...form, disposal_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Value</Label><Input type="number" step="0.01" value={form.disposal_value} onChange={(e) => setForm({ ...form, disposal_value: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Approval notes</Label><Textarea rows={2} value={form.approval_notes} onChange={(e) => setForm({ ...form, approval_notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Submit for approval</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted-foreground">No disposal records.</p> :
          data.map((r: any) => {
            const status = r.status ?? "pending";
            const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
            const isPending = status === "pending";
            const canApprove = canWrite && isPending && r.recorded_by !== user?.id;
            return (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.disposal_reason}</p>
                    <Badge variant={variant as any} className="capitalize">{status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.disposal_date}{r.disposal_value ? ` · $${Number(r.disposal_value).toLocaleString()}` : ""}</p>
                  {r.approval_notes && <p className="mt-1 text-xs">{r.approval_notes}</p>}
                  {r.approved_at && <p className="mt-1 text-xs text-muted-foreground">{status === "approved" ? "Approved" : "Reviewed"} {new Date(r.approved_at).toLocaleDateString()}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {canApprove && (
                    <>
                      <Button size="icon" variant="ghost" title="Approve" onClick={() => approve(r.id)}><Check className="h-4 w-4 text-green-600" /></Button>
                      <Button size="icon" variant="ghost" title="Reject" onClick={() => reject(r.id)}><X className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                  {canWrite && <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </div>
            );
          })}
      </div>
      {canWrite && <p className="text-xs text-muted-foreground">Disposals require a separate manager's approval before the asset is marked as disposed. You cannot approve a record you submitted yourself.</p>}
    </div>
  );
}
