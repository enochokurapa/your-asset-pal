import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  location_mode: "internal" | "branch" | "geographic" | "hybrid";
  default_country_code: string | null;
  allowed_country_codes: string[];
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
  default_country_code: null,
  allowed_country_codes: [],
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

  const toggleCountry = (code: string) => {
    setForm((current) => {
      const selected = current.allowed_country_codes.includes(code)
        ? current.allowed_country_codes.filter((c) => c !== code)
        : [...current.allowed_country_codes, code];
      const defaultCountry = current.default_country_code && selected.includes(current.default_country_code)
        ? current.default_country_code
        : null;
      return { ...current, allowed_country_codes: selected, default_country_code: defaultCountry };
    });
  };

  const save = async () => {
    if (!tenantId || !isTenantAdmin) return;
    if (["geographic","hybrid"].includes(form.location_mode) && form.allowed_country_codes.length === 0) {
      toast.error("Select at least one allowed country for this location model");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const normalized = {
        ...form,
        require_branch: usesBranch ? form.require_branch : false,
        require_geography: usesGeography ? form.require_geography : false,
        require_internal_location: usesInternal ? form.require_internal_location : false,
        require_gps: usesGeography ? form.require_gps : false,
      };
      const { error } = await (supabase as any).from("tenant_location_settings").upsert({
        tenant_id: tenantId,
        ...normalized,
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

  const usesGeography = ["geographic", "hybrid"].includes(form.location_mode);
  const usesBranch = ["branch", "hybrid"].includes(form.location_mode);
  const usesInternal = ["internal", "hybrid"].includes(form.location_mode);

  const changeMode = (mode: Settings["location_mode"]) => {
    setForm((current) => ({
      ...current,
      location_mode: mode,
      require_branch: ["branch", "hybrid"].includes(mode) ? current.require_branch : false,
      require_geography: ["geographic", "hybrid"].includes(mode) ? current.require_geography : false,
      require_internal_location: ["internal", "hybrid"].includes(mode) ? current.require_internal_location : false,
      require_gps: ["geographic", "hybrid"].includes(mode) ? current.require_gps : false,
    }));
  };

  const modeDescription = {
    internal: "Assets are mainly kept inside offices, stores, rooms or departments.",
    branch: "Assets are managed primarily by branch or site.",
    geographic: "Assets are deployed across districts, towns, communities or field sites.",
    hybrid: "Use branches/internal locations together with geographic areas when needed.",
  }[form.location_mode];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Asset location setup</h3>
        <p className="text-sm text-muted-foreground">Set the organisation defaults once. Staff will only see the fields needed during asset capture.</p>
      </div>

      <fieldset disabled={!isTenantAdmin} className="space-y-5">
        <Card className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Location model</Label>
              <Select value={form.location_mode} onValueChange={(v) => changeMode(v as Settings["location_mode"])}>
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

            {usesBranch && (
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
            )}

            {usesGeography && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <Label>Countries used by this organisation</Label>
                  <div className="flex flex-wrap gap-2">
                    {(countries as any[]).map((c) => {
                      const active = form.allowed_country_codes.includes(c.code);
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => toggleCountry(c.code)}
                          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Select only countries where this organisation actually places or manages assets.</p>
                </div>

                <div className="space-y-2">
                  <Label>Default country</Label>
                  <Select
                    value={form.default_country_code || "none"}
                    onValueChange={(v) => set("default_country_code", v === "none" ? null : v)}
                    disabled={form.allowed_country_codes.length === 0}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No default; user selects</SelectItem>
                      {(countries as any[])
                        .filter((c) => form.allowed_country_codes.includes(c.code))
                        .map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </Card>

        <details className="rounded-xl border bg-card" open>
          <summary className="cursor-pointer list-none px-4 py-3 font-medium">Required fields</summary>
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
            {[
              ...(usesBranch ? [["require_branch", "Branch", "Require a branch before an asset can be saved."]] : []),
              ...(usesGeography ? [
                ["require_geography", "Geographic area", "Require a district, county or region and mapped area."],
                ["require_gps", "GPS verification", "Require a device GPS capture before saving."],
              ] : []),
              ...(usesInternal ? [["require_internal_location", "Internal location", "Require an office, store, room or site."]] : []),
            ].map(([key, title, description]) => (
              <label key={key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                <Switch checked={Boolean(form[key as keyof Settings])} onCheckedChange={(v) => set(key as keyof Settings, v as never)} />
              </label>
            ))}
          </div>
        </details>

        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium">Capture preferences</summary>
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
            {[
              ...(usesInternal ? [["allow_inline_location_create", "Quick add location", "Allow authorised users to add a room, store or site without leaving asset entry."]] : []),
              ["remember_last_selection", "Remember last selection", "Reuse the previous location choices during repeated capture."],
              ...(usesGeography ? [
                ["allow_custom_area", "Custom area", "Allow organisation-specific site names where needed."],
                ["show_coordinates", "Show coordinates", "Display raw latitude and longitude to users."],
              ] : []),
            ].map(([key, title, description]) => (
              <label key={key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                <Switch checked={Boolean(form[key as keyof Settings])} onCheckedChange={(v) => set(key as keyof Settings, v as never)} />
              </label>
            ))}
          </div>
        </details>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !isTenantAdmin}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </fieldset>
    </div>
  );
}
