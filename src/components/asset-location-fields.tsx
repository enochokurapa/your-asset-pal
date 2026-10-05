import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crosshair, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";

export type AssetLocationValue = {
  branch_id: string | null;
  location_id: string | null;
  geo_place_id: number | null;
  location_latitude: string;
  location_longitude: string;
  location_accuracy_m: string;
  location_source: string;
};

export function AssetLocationFields({
  value,
  onChange,
  branches,
  locations,
}: {
  value: AssetLocationValue;
  onChange: (next: AssetLocationValue) => void;
  branches: any[];
  locations: any[];
}) {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  const [geoQuery, setGeoQuery] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState("office");

  const { data: settings } = useQuery({
    queryKey: ["tenant-location-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenant_location_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
      return data;
    },
  });

  const defaultCountry = settings?.default_country_code || "UG";
  const showBranch = ["branch", "hybrid"].includes(settings?.location_mode) || settings?.require_branch;
  const showInternal = ["internal", "hybrid"].includes(settings?.location_mode) || settings?.require_internal_location;
  const showGeo = ["geographic", "hybrid"].includes(settings?.location_mode) || settings?.require_geography;

  const eligibleLocations = useMemo(
    () => locations.filter((l: any) => l.is_active !== false && (!value.branch_id || !l.branch_id || l.branch_id === value.branch_id)),
    [locations, value.branch_id],
  );

  const selectedGeoId = value.geo_place_id;
  const { data: selectedGeo } = useQuery({
    queryKey: ["geo-place-selected", selectedGeoId],
    enabled: !!selectedGeoId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,country_code,latitude,longitude")
        .eq("geoname_id", selectedGeoId).maybeSingle();
      return data;
    },
  });

  const { data: geoResults = [], isFetching: geoSearching } = useQuery({
    queryKey: ["geo-place-search", defaultCountry, geoQuery],
    enabled: showGeo && geoQuery.trim().length >= 2,
    queryFn: async () => {
      const q = geoQuery.trim();
      const { data, error } = await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,country_code,feature_code,latitude,longitude,population")
        .eq("country_code", defaultCountry)
        .ilike("name", `%${q}%`)
        .order("population", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!settings) return;
    const rememberedBranch = settings.remember_last_selection ? localStorage.getItem("assetflow:last-branch") : null;
    const rememberedLocation = settings.remember_last_selection ? localStorage.getItem("assetflow:last-location") : null;
    let next = value;
    let changed = false;
    if (!next.branch_id) {
      const branch = settings.default_branch_id || rememberedBranch || (branches.length === 1 ? branches[0]?.id : null);
      if (branch && branches.some((b: any) => b.id === branch)) {
        next = { ...next, branch_id: branch };
        changed = true;
      }
    }
    if (!next.location_id && rememberedLocation && locations.some((l: any) => l.id === rememberedLocation)) {
      const loc = locations.find((l: any) => l.id === rememberedLocation);
      next = { ...next, location_id: rememberedLocation, geo_place_id: loc?.geo_place_id ?? next.geo_place_id };
      changed = true;
    }
    if (changed) onChange(next);
    // defaults should only apply after settings load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.tenant_id]);

  const patch = (p: Partial<AssetLocationValue>) => onChange({ ...value, ...p });

  const chooseLocation = (id: string | null) => {
    const loc = locations.find((l: any) => l.id === id);
    patch({
      location_id: id,
      geo_place_id: loc?.geo_place_id ?? value.geo_place_id,
    });
    if (settings?.remember_last_selection) {
      if (id) localStorage.setItem("assetflow:last-location", id);
      else localStorage.removeItem("assetflow:last-location");
    }
  };

  const chooseBranch = (id: string | null) => {
    patch({ branch_id: id, location_id: null });
    if (settings?.remember_last_selection) {
      if (id) localStorage.setItem("assetflow:last-branch", id);
      else localStorage.removeItem("assetflow:last-branch");
      localStorage.removeItem("assetflow:last-location");
    }
  };

  const chooseGeo = (place: any) => {
    patch({ geo_place_id: Number(place.geoname_id) });
    setGeoQuery("");
  };

  const captureGps = () => {
    if (!navigator.geolocation) return toast.error("GPS is not available on this device");
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        patch({
          location_latitude: position.coords.latitude.toFixed(7),
          location_longitude: position.coords.longitude.toFixed(7),
          location_accuracy_m: Math.round(position.coords.accuracy).toString(),
          location_source: "device_gps",
        });
        setCapturing(false);
        toast.success("GPS captured");
      },
      (error) => {
        setCapturing(false);
        toast.error(error.code === error.PERMISSION_DENIED ? "Allow location permission and try again" : "Could not capture GPS");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const createQuickLocation = async () => {
    if (!quickName.trim()) return toast.error("Location name is required");
    const geo: any = selectedGeo;
    const { data, error } = await (supabase as any).from("locations").insert({
      name: quickName.trim(),
      location_type: quickType,
      branch_id: value.branch_id,
      geo_place_id: value.geo_place_id,
      country_code: geo?.country_code || defaultCountry,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      location_source: value.geo_place_id ? "map" : "manual",
      is_structured: true,
      is_active: true,
    }).select("*").single();
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["locations-list"] });
    chooseLocation(data.id);
    setQuickOpen(false);
    setQuickName("");
    toast.success("Location created and selected");
  };

  return (
    <div className="sm:col-span-2 rounded-xl border bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Asset location</p>
          <p className="text-xs text-muted-foreground">Configured by your administrator. Only the fields your organisation uses are shown.</p>
        </div>
        {settings?.location_mode && <Badge variant="outline" className="capitalize">{settings.location_mode}</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {showBranch && (
          <div className="space-y-2">
            <Label>Branch {settings?.require_branch ? "*" : ""}</Label>
            <Select value={value.branch_id || "none"} onValueChange={(v) => chooseBranch(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {!settings?.require_branch && <SelectItem value="none">No branch</SelectItem>}
                {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {showInternal && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Office / store / site {settings?.require_internal_location ? "*" : ""}</Label>
              {settings?.allow_inline_location_create && (
                <button type="button" className="text-xs font-medium text-primary" onClick={() => setQuickOpen(true)}>+ Add</button>
              )}
            </div>
            <Select value={value.location_id || "none"} onValueChange={(v) => chooseLocation(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {!settings?.require_internal_location && <SelectItem value="none">Not specified</SelectItem>}
                {eligibleLocations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {showGeo && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Geographic area {settings?.require_geography ? "*" : ""}</Label>
            {selectedGeo ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{(selectedGeo as any).name}</p>
                  <p className="truncate text-xs text-muted-foreground">{(selectedGeo as any).display_path}</p>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => patch({ geo_place_id: null })}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="relative">
                <Input value={geoQuery} onChange={(e) => setGeoQuery(e.target.value)} placeholder="Search district, town, area or village…" />
                {geoQuery.trim().length >= 2 && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-sm">
                    {geoSearching && <p className="p-3 text-xs text-muted-foreground">Searching…</p>}
                    {!geoSearching && (geoResults as any[]).length === 0 && <p className="p-3 text-xs text-muted-foreground">No matching mapped area. Use a custom organisation location if needed.</p>}
                    {(geoResults as any[]).map((place) => (
                      <button key={place.geoname_id} type="button" onClick={() => chooseGeo(place)} className="block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-muted">
                        <p className="text-sm font-medium">{place.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{place.display_path}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(settings?.require_gps || settings?.location_mode === "geographic" || settings?.location_mode === "hybrid") && (
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={captureGps} disabled={capturing}>
              <Crosshair className="mr-2 h-4 w-4" />{capturing ? "Capturing GPS…" : settings?.require_gps ? "Capture GPS *" : "Capture GPS"}
            </Button>
            {value.location_latitude && value.location_longitude && (
              <Badge variant="secondary">GPS captured{value.location_accuracy_m ? ` · ±${value.location_accuracy_m}m` : ""}</Badge>
            )}
            {settings?.show_coordinates && value.location_latitude && (
              <span className="font-mono text-xs text-muted-foreground">{value.location_latitude}, {value.location_longitude}</span>
            )}
          </div>
        )}
      </div>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add organisation location</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Name</Label><Input value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="e.g. Finance Store, Floor 2, Client Site" /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={quickType} onValueChange={setQuickType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="store">Store</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="archive">Archive</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="building">Building</SelectItem>
                  <SelectItem value="field_site">Field site</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setQuickOpen(false)}>Cancel</Button><Button onClick={createQuickLocation}><Plus className="mr-2 h-4 w-4" />Add & select</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
