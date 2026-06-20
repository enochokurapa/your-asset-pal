import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FIELD_LABELS: Record<string, string> = {
  from_location_id: "From location",
  to_location_id: "To location",
  from_branch_id: "From branch",
  to_branch_id: "To branch",
  branch_id: "Branch",
  location_id: "Location",
  from_user: "From custodian",
  to_user: "To custodian",
  custodian_id: "Custodian",
  department_id: "Department",
  category_id: "Category",
  asset_id: "Asset",
  transfer_type: "Transfer type",
  reason: "Reason",
  notes: "Notes",
  amount: "Amount",
  method: "Method",
  buyer: "Buyer",
  vendor: "Vendor",
  effective_date: "Effective date",
  scheduled_date: "Scheduled date",
};

function prettyLabel(k: string) {
  return FIELD_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(prettyValue).join(", ");
  return JSON.stringify(v);
}

const ID_FIELDS = {
  branch: ["branch_id", "from_branch_id", "to_branch_id"],
  location: ["location_id", "from_location_id", "to_location_id"],
  user: ["from_user", "to_user", "custodian_id", "requested_by", "approver_id"],
  category: ["category_id"],
  asset: ["asset_id"],
};

export function ApprovalPayloadView({ payload }: { payload: Record<string, any> | null | undefined }) {
  const entries = Object.entries(payload ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");

  const collect = (keys: string[]) =>
    Array.from(new Set(entries.filter(([k]) => keys.includes(k)).map(([, v]) => String(v))));

  const branchIds = collect(ID_FIELDS.branch);
  const locationIds = collect(ID_FIELDS.location);
  const userIds = collect(ID_FIELDS.user);
  const categoryIds = collect(ID_FIELDS.category);
  const assetIds = collect(ID_FIELDS.asset);

  const { data: names } = useQuery({
    queryKey: ["payload-names", branchIds, locationIds, userIds, categoryIds, assetIds],
    queryFn: async () => {
      const [b, l, p, c, a] = await Promise.all([
        branchIds.length ? supabase.from("branches").select("id,name").in("id", branchIds) : Promise.resolve({ data: [] as any[] }),
        locationIds.length ? supabase.from("locations").select("id,name").in("id", locationIds) : Promise.resolve({ data: [] as any[] }),
        userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
        categoryIds.length ? supabase.from("categories").select("id,name").in("id", categoryIds) : Promise.resolve({ data: [] as any[] }),
        assetIds.length ? supabase.from("assets").select("id,name,asset_tag").in("id", assetIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const m = new Map<string, string>();
      ((b as any).data ?? []).forEach((r: any) => m.set(r.id, r.name));
      ((l as any).data ?? []).forEach((r: any) => m.set(r.id, r.name));
      ((p as any).data ?? []).forEach((r: any) => m.set(r.id, r.full_name || r.email));
      ((c as any).data ?? []).forEach((r: any) => m.set(r.id, r.name));
      ((a as any).data ?? []).forEach((r: any) => m.set(r.id, r.asset_tag ? `${r.name} (${r.asset_tag})` : r.name));
      return m;
    },
  });

  if (entries.length === 0) return null;

  const allIdKeys = new Set<string>([
    ...ID_FIELDS.branch, ...ID_FIELDS.location, ...ID_FIELDS.user, ...ID_FIELDS.category, ...ID_FIELDS.asset,
  ]);

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
      {entries.map(([k, v]) => {
        let display: string;
        if (allIdKeys.has(k) && typeof v === "string") {
          display = names?.get(v) ?? v;
        } else if (k === "changes" && typeof v === "object" && v) {
          display = Object.entries(v as Record<string, any>)
            .map(([ck, cv]: any) => `${prettyLabel(ck)}: ${cv?.from ?? "—"} → ${cv?.to ?? "—"}`)
            .join("; ");
        } else {
          display = prettyValue(v);
        }
        return (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{prettyLabel(k)}</dt>
            <dd className="break-words">{display}</dd>
          </div>
        );
      })}
    </dl>
  );
}
