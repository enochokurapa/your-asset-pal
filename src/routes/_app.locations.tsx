import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, MapPin, Crosshair, Navigation, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { PESAPAL_COUNTRIES, countryByCode } from "@/lib/pesapal-geography";

export const Route = createFileRoute("/_app/locations")({
  component: LocationsPage,
});

type Loc = {
  id: string;
  name: string;
  address: string | null;
  parent_id: string | null;
  is_active: boolean;
  country_code?: string | null;
  administrative_area?: string | null;
  locality?: string | null;
  custom_area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
  location_source?: string | null;
  last_verified_at?: string | null;
};

type FormState = {
  id?: string;
  name: string;
  address: string;
  parent_id: string;
  is_active: boolean;
  country_code: string;
  administrative_area: string;
  locality: string;
  custom_area: string;
  latitude: string;
  longitude: string;
  gps_accuracy_m: string;
  location_source: string;
};

const emptyForm: FormState = {
  name: "",
  address: "",
  parent_id: "",
  is_active: true,
  country_code: "UG",
  administrative_area: "",
  locality: "",
  custom_area: "",
  latitude: "",
  longitude: "",
  gps_accuracy_m: "",
  location_source: "manual",
};

function LocationsPage() {
  const { canWrite, canDo, canView, user } = useAuth();
  const canEdit = canWrite || canDo("edit_location");
  const geolocationEnabled = canView("geolocation");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data = [], isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await supabase.from("locations").select("*").order("name")).data ?? [],
  });

  const selectedCountry = countryByCode(form.country_code);
  const districtOptions = Object.keys(selectedCountry?.areas ?? {});
  const localityOptions = form.administrative_area
    ? selectedCountry?.areas[form.administrative_area] ?? []
    : [];

  const { parents, childrenByParent } = useMemo(() => {
    const all = data as Loc[];
    const parents = all.filter((l) => !l.parent_id);
    const childrenByParent: Record<string, Loc[]> = {};
    all.forEach((l) => {
      if (l.parent_id) (childrenByParent[l.parent_id] ||= []).push(l);
    });
    return { parents, childrenByParent };
  }, [data]);

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error("GPS is not available on this device or browser");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          gps_accuracy_m: Math.round(position.coords.accuracy).toString(),
          location_source: "device_gps",
        }));
        setCapturing(false);
        toast.success("Current GPS position captured");
      },
      (error) => {
        setCapturing(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access and try again."
            : "Could not capture the current GPS location.";
        toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.id && form.parent_id === form.id) {
      toast.error("A location can't be its own parent");
      return;
    }

    const latitude = form.latitude ? Number(form.latitude) : null;
    const longitude = form.longitude ? Number(form.longitude) : null;
    if (latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
      toast.error("Latitude is invalid");
      return;
    }
    if (longitude !== null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
      toast.error("Longitude is invalid");
      return;
    }

    const payload: any = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
    };

    if (geolocationEnabled) {
      payload.country_code = form.country_code || null;
      payload.administrative_area = form.administrative_area || null;
      payload.locality = form.locality || null;
      payload.custom_area = form.custom_area.trim() || null;
      payload.latitude = latitude;
      payload.longitude = longitude;
      payload.gps_accuracy_m = form.gps_accuracy_m ? Number(form.gps_accuracy_m) : null;
      payload.location_source = form.location_source || "manual";
      if (latitude !== null && longitude !== null) {
        payload.last_verified_at = new Date().toISOString();
        payload.last_verified_by = user?.id ?? null;
      }
    }

    const { error } = form.id
      ? await supabase.from("locations").update(payload).eq("id", form.id)
      : await supabase.from("locations").insert(payload);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Location updated" : "Location created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["locations-list"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this location? Sub-locations will become top-level.")) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["locations"] });
  };

  const toggleActive = async (l: Loc) => {
    const { error } = await supabase.from("locations").update({ is_active: !l.is_active }).eq("id", l.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(!l.is_active ? "Activated" : "Deactivated");
    qc.invalidateQueries({ queryKey: ["locations"] });
  };

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (l: Loc) => {
    setForm({
      id: l.id,
      name: l.name,
      address: l.address ?? "",
      parent_id: l.parent_id ?? "",
      is_active: l.is_active,
      country_code: l.country_code ?? "UG",
      administrative_area: l.administrative_area ?? "",
      locality: l.locality ?? "",
      custom_area: l.custom_area ?? "",
      latitude: l.latitude?.toString() ?? "",
      longitude: l.longitude?.toString() ?? "",
      gps_accuracy_m: l.gps_accuracy_m?.toString() ?? "",
      location_source: l.location_source ?? "manual",
    });
    setOpen(true);
  };

  const renderCard = (l: Loc, isChild = false) => {
    const country = countryByCode(l.country_code)?.name;
    const geoLine = [country, l.administrative_area, l.locality, l.custom_area].filter(Boolean).join(" · ");
    return (
      <div key={l.id} className={`rounded-xl border bg-card p-4 ${isChild ? "ml-4 border-dashed" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">{l.name}</p>
              {!l.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
              {geolocationEnabled && l.latitude != null && l.longitude != null && (
                <Badge variant="outline" className="gap-1 text-xs"><Navigation className="h-3 w-3" /> GPS mapped</Badge>
              )}
            </div>
            {geoLine && <p className="mt-1 text-sm text-muted-foreground">{geoLine}</p>}
            {l.address && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{l.address}</p>}
            {geolocationEnabled && l.latitude != null && l.longitude != null && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {Number(l.latitude).toFixed(6)}, {Number(l.longitude).toFixed(6)}
                {l.gps_accuracy_m ? ` · ±${Math.round(l.gps_accuracy_m)}m` : ""}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
              {canWrite && <Button size="icon" variant="ghost" onClick={() => remove(l.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="mt-3 flex items-center gap-2 border-t pt-2 text-xs">
            <Switch checked={l.is_active} onCheckedChange={() => toggleActive(l)} />
            <span className="text-muted-foreground">{l.is_active ? "Active" : "Inactive"}</span>
          </div>
        )}
      </div>
    );
  };

  const parentOptions = useMemo(() => {
    if (!form.id) return data as Loc[];
    const blocked = new Set<string>([form.id]);
    let added = true;
    while (added) {
      added = false;
      (data as Loc[]).forEach((l) => {
        if (l.parent_id && blocked.has(l.parent_id) && !blocked.has(l.id)) {
          blocked.add(l.id);
          added = true;
        }
      });
    }
    return (data as Loc[]).filter((l) => !blocked.has(l.id));
  }, [data, form.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
          <p className="text-sm text-muted-foreground">
            Manage company locations, geographic areas and optional GPS coordinates.
          </p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New location</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit" : "New"} location</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Location name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PesaPal HQ, Finance Office" />
                  </div>
                  <div className="space-y-2">
                    <Label>Parent / internal location</Label>
                    <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Top level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Top level —</SelectItem>
                        {parentOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {geolocationEnabled && (
                  <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">Geographic location</p>
                        <p className="text-xs text-muted-foreground">Country, district/city and area are optional but recommended for mapped assets.</p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Country</Label>
                        <Select
                          value={form.country_code || "UG"}
                          onValueChange={(v) => setForm({ ...form, country_code: v, administrative_area: "", locality: "" })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PESAPAL_COUNTRIES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>District / city</Label>
                        <Select
                          value={form.administrative_area || "none"}
                          onValueChange={(v) => setForm({ ...form, administrative_area: v === "none" ? "" : v, locality: "" })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not specified</SelectItem>
                            {districtOptions.map((district) => <SelectItem key={district} value={district}>{district}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Area / locality</Label>
                        <Select
                          value={form.locality || "none"}
                          onValueChange={(v) => setForm({ ...form, locality: v === "none" ? "" : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not specified</SelectItem>
                            {localityOptions.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Smaller/custom area</Label>
                      <Input
                        value={form.custom_area}
                        onChange={(e) => setForm({ ...form, custom_area: e.target.value })}
                        placeholder="Optional: building, estate, wing, village, floor, room..."
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={captureGps} disabled={capturing}>
                        <Crosshair className="mr-2 h-4 w-4" />
                        {capturing ? "Capturing GPS…" : "Use Current GPS"}
                      </Button>
                      {(form.latitude && form.longitude) && (
                        <Badge variant="secondary">
                          {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)}
                          {form.gps_accuracy_m ? ` · ±${form.gps_accuracy_m}m` : ""}
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Latitude</Label>
                        <Input inputMode="decimal" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value, location_source: "manual" })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Longitude</Label>
                        <Input inputMode="decimal" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value, location_source: "manual" })} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Address / directions</Label>
                  <Textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  Active
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {geolocationEnabled && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Supported countries</p>
            <p className="mt-1 text-2xl font-bold">{PESAPAL_COUNTRIES.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">GPS mapped</p>
            <p className="mt-1 text-2xl font-bold">{(data as Loc[]).filter((l) => l.latitude != null && l.longitude != null).length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unmapped</p>
            <p className="mt-1 text-2xl font-bold">{(data as Loc[]).filter((l) => l.latitude == null || l.longitude == null).length}</p>
          </Card>
        </div>
      )}

      <Card className="p-4">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <div className="py-12 text-center">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No locations yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {parents.map((p) => (
              <div key={p.id} className="space-y-2">
                {renderCard(p)}
                {(childrenByParent[p.id] ?? []).map((c) => renderCard(c, true))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
