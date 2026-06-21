import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ApprovalKind = "movement" | "retirement" | "disposal" | "reactivation" | "update" | "set_for_disposal" | "maintenance" | "deletion" | "attachment_deletion";

export async function submitApproval(params: {
  kind: ApprovalKind;
  assetId?: string | null;
  payload?: Record<string, any>;
  reason?: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { data, error } = await supabase.from("approval_requests").insert({
    kind: params.kind,
    asset_id: params.assetId ?? null,
    requested_by: u.user.id,
    payload: params.payload ?? {},
    reason: params.reason ?? null,
  }).select().single();
  if (error) throw error;
  // Reflect pending disposal on the asset so dashboard tiles update immediately.
  // Uses a SECURITY DEFINER helper so staff without direct UPDATE rights on
  // `assets` can still flip this flag when submitting their own request.
  if (params.assetId && (params.kind === "disposal" || params.kind === "set_for_disposal")) {
    await supabase.rpc("mark_for_disposal" as any, { _asset_id: params.assetId, _on: true });
  }
  toast.success("Submitted for approval");
  return data;
}

export async function decideApproval(id: string, status: "approved" | "rejected", reason?: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");

  // Load request
  const { data: req, error: reqErr } = await supabase.from("approval_requests").select("*").eq("id", id).single();
  if (reqErr || !req) throw reqErr ?? new Error("Not found");
  if (req.status !== "pending") { toast.error("Already decided"); return; }
  if (req.requested_by === u.user.id) {
    const [{ data: roleRows }, { data: rightRows }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      supabase.from("user_action_rights").select("action_kind").eq("user_id", u.user.id).eq("action_kind", "approve_own_request"),
    ]);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");
    const canApproveOwn = isAdmin || ((rightRows ?? []).length > 0);
    if (!canApproveOwn) { toast.error("You cannot approve your own request"); return; }
  }


  // Apply effect on approval
  if (status === "approved" && req.asset_id) {
    if (req.kind === "retirement") {
      const { data: a } = await supabase.from("assets").select("status").eq("id", req.asset_id).single();
      await supabase.from("assets").update({ status: "retired", previous_status: a?.status ?? null }).eq("id", req.asset_id);
    } else if (req.kind === "reactivation") {
      const { data: a } = await supabase.from("assets").select("previous_status").eq("id", req.asset_id).single();
      await supabase.from("assets").update({ status: a?.previous_status ?? "in_storage", previous_status: null }).eq("id", req.asset_id);
    } else if (req.kind === "set_for_disposal") {
      await supabase.from("assets").update({ set_for_disposal: true }).eq("id", req.asset_id);
    } else if (req.kind === "disposal") {
      await supabase.from("assets").update({ status: "disposed", set_for_disposal: false }).eq("id", req.asset_id);
    } else if (req.kind === "maintenance") {
      const { data: a } = await supabase.from("assets").select("status").eq("id", req.asset_id).single();
      if (a?.status !== "under_repair") {
        await supabase.from("assets").update({ status: "under_repair", previous_status: a?.status ?? null }).eq("id", req.asset_id);
      }
    } else if (req.kind === "movement" && req.payload) {
      const p = req.payload as any;
      await supabase.from("asset_movements").insert({
        asset_id: req.asset_id,
        from_location_id: p.from_location_id ?? null,
        to_location_id: p.to_location_id ?? null,
        from_branch_id: p.from_branch_id ?? null,
        to_branch_id: p.to_branch_id ?? null,
        from_user: p.from_user ?? null,
        to_user: p.to_user ?? null,
        transfer_type: p.transfer_type ?? "internal",
        reason: p.reason ?? null,
        moved_by: u.user.id,
      });
      if (p.to_location_id) await supabase.from("assets").update({ location_id: p.to_location_id }).eq("id", req.asset_id);
      if (p.to_branch_id)   await supabase.from("assets").update({ branch_id: p.to_branch_id }).eq("id", req.asset_id);
    }
  }

  // On rejection of a disposal/set-for-disposal request, clear the pending flag.
  if (status === "rejected" && req.asset_id && (req.kind === "disposal" || req.kind === "set_for_disposal")) {
    await supabase.rpc("mark_for_disposal" as any, { _asset_id: req.asset_id, _on: false });
  }

  // Record the decision FIRST. For deletion we then cascade-delete the asset
  // (which also removes the approval_requests row, so updating after would fail).
  const { error } = await supabase.from("approval_requests").update({
    status, reason: reason ?? null, approver_id: u.user.id, decided_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;

  if (status === "approved" && req.kind === "deletion" && req.asset_id) {
    const { error: delErr } = await supabase.rpc("delete_asset_cascade" as any, { _asset_id: req.asset_id });
    if (delErr) { toast.error(delErr.message); return; }
  }

  // Attachment deletion: remove storage object + DB row.
  if (status === "approved" && req.kind === "attachment_deletion" && req.payload) {
    const p = req.payload as any;
    if (p.storage_path) {
      await supabase.storage.from("asset-files").remove([p.storage_path]);
    }
    if (p.attachment_id) {
      await supabase.from("asset_attachments").delete().eq("id", p.attachment_id);
    }
  }

  toast.success(`Request ${status}`);
}
