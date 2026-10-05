import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MapPinned, Save } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  location_mode: "internal" | "branch" | "geographic" | "hybrid";
  default_country_code: string | null;
  default_branch_id: string | null;
  require_branch: boolean;
  require_geography: boolean;
  require_internal_location: boolean;
  require_gps: boolean;
  allow_custom_area: boolean;
  allow_inline_location_create: boolean;
  remember_last_selection: boolean;
  show_coordinates: boolean;
};

const DEFAULTS: Settings = {
  location_mode: "internal",
  default_country_code: "UG",
  default_branch_id: null,
  require_branch: false,
  require_geography: false,
  require_internal_location: false,
  require_gps: false,
  allow_custom_area: true,
  allow_inline_location_create: true,
  remember_last_selection: true,
  show_coordinates: false,
};

export function LocationSettingsPanel() {
  const { tenantId, isTenantAdmin } = useAuth();
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data: countries = [] } = useQuery({
    queryKey: ["geo-countries"],
    queryFn: async () => (await (supabase as any).from("geo_countries").select("code,name").eq("enabled", true).order("name")).data ?? [],
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["location-settings-branches"],
    queryFn: async () => (await supabase.from("branches").select("id,name,code,is_active").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: saved } = useQuery({
    queryKey: ["tenant-location-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("tenant_location_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (saved) setForm({ ...DEFAULTS, ...saved });
  }, [saved]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!tenantId || !isTenantAdmin) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("tenant_location_settings").upsert({
        tenant_id: tenantId,
        ...form,
        updated_at: new Date().toISOString(),
        updated_by: auth.user?.id ?? null,
      }, { onConflict: "tenant_id" });
      if (error) throw error;
      toast.success("Asset location defaults saved");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save location settings");
    } finally {
      setSaving(false);
    }
  };

  const modeDescription = {
    internal: "Assets are mainly kept inside offices, stores, rooms or departments.",
    branch: "Assets are managed primarily by branch or site.",
    geographic: "Assets are deployed across districts, towns, communities or field sites.",
    hybrid: "Use branches/internal locations together with geographic areas when needed.",
  }[form.location_mode];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <MapPinned className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold">Asset location setup</h3>
          <p className="text-sm text-muted-foreground">Configure this once. Asset-entry screens automatically use these defaults so staff do not repeatedly choose a location model.</p>
        </div>
      </div>

      <fieldset disabled={!isTenantAdmin} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Location model</Label>
            <Select value={form.location_mode} onValueChange={(v) => set("location_mode", v as Settings["location_mode"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="branch">Branch based</SelectItem>
                <SelectItem value="geographic">Geographic / field</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{modeDescription}</p>
          </div>

          <div className="space-y-2">
            <Label>Default country</Label>
            <Select value={form.default_country_code || "none"} onValueChange={(v) => set("default_country_code", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {(countries as any[]).map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default branch</Label>
            <Select value={form.default_branch_id || "none"} onValueChange={(v) => set("default_branch_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {(branches as any[]).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          {[
            ["require_branch", "Require branch", "Do not save an asset without a branch."],
            ["require_geography", "Require geographic area", "Require a mapped district/town/area for each asset."],
            ["require_internal_location", "Require internal location", "Require a room/store/office/site where the organisation uses internal locations."],
            ["require_gps", "Require GPS verification", "Require a device GPS capture before saving the asset."],
            ["allow_inline_location_create", "Allow quick location creation", "Authorized users can create a room/store/site without leaving asset entry."],
            ["remember_last_selection", "Remember last selection", "Reuse the previous branch/location during bulk capture on the same device."],
            ["allow_custom_area", "Allow custom area", "Permit organisation-specific site names when the global geography does not contain the exact place."],
            ["show_coordinates", "Show raw coordinates", "Normally coordinates stay hidden to keep capture screens clean."],
          ].map(([key, title, description]) => (
            <div key={key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
              <Switch checked={Boolean(form[key as keyof Settings])} onCheckedChange={(v) => set(key as keyof Settings, v as never)} />
            </div>
          ))}
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !isTenantAdmin}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save location setup"}</Button>
        </div>
      </fieldset>
    </div>
  );
}
