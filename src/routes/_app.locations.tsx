import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ResponsiveTabsList as TabsList, ResponsiveTabsTrigger as TabsTrigger } from "@/components/ui/responsive-tabs";
import { Globe2, Plus, ChevronRight, ChevronLeft, Trash2, Pencil, CornerDownRight, Package, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/locations")({ component: LocationsPage });

const TYPE_LABEL: Record<string,string> = {
  site:"Site", branch:"Branch", building:"Building", floor:"Floor", department:"Department",
  office:"Office", room:"Room", store:"Store", warehouse:"Warehouse", archive:"Archive",
  field_site:"Field site", area:"Area", other:"Other",
};

function LocationsPage() {
  const { canWrite, canDo, canView, isTenantAdmin } = useAuth();
  const nav = useNavigate();
  const canEdit = canWrite || canDo("edit_location");
  const qc = useQueryClient();

  const { data: locations = [], isError: locationsError, error: locationsQueryError } = useQuery({
    queryKey:["locations"],
    queryFn:async()=> {
      const { data, error } = await (supabase as any).from("locations")
        .select("*, branches(name,code), geo_places(name,display_path)")
        .eq("is_active",true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey:["branches-active"],
    queryFn:async()=> (await supabase.from("branches").select("id,name,code,is_active").eq("is_active",true).order("name")).data ?? [],
  });
  const { data: countries = [] } = useQuery({
    queryKey:["geo-countries"],
    queryFn:async()=> (await (supabase as any).from("geo_countries").select("code,name").eq("enabled",true).order("name")).data ?? [],
  });
  const { data: locationAssets = [] } = useQuery({
    queryKey:["location-kpi-assets"],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("assets")
        .select("id,name,asset_tag,status,branch_id,location_id,geo_place_id,location_latitude,location_longitude, geo_places!assets_geo_place_id_fkey(geoname_id,name,display_path,country_code)");
      if(error) throw error;
      return data ?? [];
    },
  });


  const locatedAssets = (locationAssets as any[]).filter((a)=>a.location_id || a.geo_place_id).length;
  const unlocatedAssets = Math.max(0, locationAssets.length - locatedAssets);
  const gpsVerifiedAssets = (locationAssets as any[]).filter((a)=>a.location_latitude != null && a.location_longitude != null).length;
  const subLocations = (locations as any[]).filter((l)=>!!l.parent_id).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
        <p className="text-sm text-muted-foreground">Organisation locations and the global geography used by assets, movements and verification.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Organisation locations", locations.length],
          ["Sub-locations", subLocations],
          ["Assets with location", locatedAssets],
          ["Assets without location", unlocatedAssets],
        ].map(([label,value])=>(
          <Card key={String(label)} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      {gpsVerifiedAssets > 0 && (
        <p className="text-xs text-muted-foreground">{gpsVerifiedAssets} asset{gpsVerifiedAssets===1?"":"s"} currently have GPS verification.</p>
      )}

      <Tabs defaultValue="organisation">
        <TabsList>
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
        </TabsList>

        <TabsContent value="organisation" className="pt-4">
          <OrganisationLocations
            locations={locations as any[]}
            branches={branches as any[]}
            canEdit={canEdit}
            canWrite={canWrite}
            queryError={locationsError ? locationsQueryError : null}
            assets={locationAssets as any[]}
            onViewAssets={(id:string)=>nav({to:"/assets",search:{location:id} as any})}
            onChanged={() => {
              qc.invalidateQueries({queryKey:["locations"]});
              qc.invalidateQueries({queryKey:["locations-list"]});
            }}
          />
        </TabsContent>

        <TabsContent value="geography" className="pt-4">
          <GeographyBrowser countries={countries as any[]} assets={locationAssets as any[]} onViewAssets={(id:number)=>nav({to:"/assets",search:{geo:String(id)} as any})} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrganisationLocations({
  locations, branches, canEdit, canWrite, queryError, assets, onViewAssets, onChanged,
}:{
  locations:any[]; branches:any[]; canEdit:boolean; canWrite:boolean; queryError:any; assets:any[];
  onViewAssets:(id:string)=>void; onChanged:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [name,setName]=useState("");
  const [type,setType]=useState("office");
  const [branch,setBranch]=useState("");
  const [parent,setParent]=useState("");

  const byParent=useMemo(()=>{
    const m:Record<string,any[]>={};
    locations.forEach(l=>(m[l.parent_id||"root"] ||= []).push(l));
    Object.values(m).forEach(items=>items.sort((a,b)=>a.name.localeCompare(b.name)));
    return m;
  },[locations]);

  const descendantsOf=(id:string)=>{
    const found=new Set<string>();
    const visit=(parentId:string)=>{
      (byParent[parentId]||[]).forEach((child:any)=>{
        if(!found.has(child.id)){found.add(child.id);visit(child.id);}
      });
    };
    visit(id);
    return found;
  };

  const assetsForLocation=(id:string)=>{
    const ids=descendantsOf(id);
    ids.add(id);
    return assets.filter((a:any)=>a.location_id && ids.has(a.location_id));
  };

  const suggestedChildType=(parentLocation:any)=>{
    switch(parentLocation?.location_type){
      case "site": case "branch": return "building";
      case "building": return "floor";
      case "floor": return "room";
      case "department": return "office";
      case "warehouse": case "archive": return "area";
      default: return "room";
    }
  };

  const resetForm=()=>{
    setEditingId(null);setName("");setType("office");setBranch("");setParent("");
  };

  const openNew=(parentLocation?:any)=>{
    setEditingId(null);
    setName("");
    if(parentLocation){
      setParent(parentLocation.id);
      setBranch(parentLocation.branch_id||"");
      setType(suggestedChildType(parentLocation));
    } else {
      setParent("");setBranch("");setType("site");
    }
    setOpen(true);
  };

  const openEdit=(location:any)=>{
    setEditingId(location.id);
    setName(location.name);
    setType(location.location_type||"other");
    setBranch(location.branch_id||"");
    setParent(location.parent_id||"");
    setOpen(true);
  };

  const saveLocation=async()=>{
    if(!name.trim()) return toast.error("Location name is required");

    const parentLocation=parent ? locations.find((l:any)=>l.id===parent) : null;
    if(editingId && parent===editingId) return toast.error("A location cannot be its own parent");
    if(editingId && parent && descendantsOf(editingId).has(parent)) {
      return toast.error("A location cannot be moved inside one of its own sub-locations");
    }

    const payload:any={
      name:name.trim(),
      location_type:type,
      parent_id:parent||null,
      branch_id:branch || parentLocation?.branch_id || null,
      is_active:true,
      is_structured:true,
      location_source:"manual",
    };

    // Sub-locations inherit geography from their parent automatically.
    if(parentLocation){
      payload.geo_place_id=parentLocation.geo_place_id ?? null;
      payload.country_code=parentLocation.country_code ?? null;
      payload.latitude=parentLocation.latitude ?? null;
      payload.longitude=parentLocation.longitude ?? null;
      if(parentLocation.geo_place_id) payload.location_source="map";
    }

    const result=editingId
      ? await (supabase as any).from("locations").update(payload).eq("id",editingId)
      : await (supabase as any).from("locations").insert(payload);
    if(result.error){
      const message=result.error.code==="23505"
        ? "A location with this name already exists under the same parent."
        : result.error.message;
      return toast.error(message);
    }
    setOpen(false);resetForm();onChanged();
    toast.success(editingId ? "Location updated" : "Location created");
  };

  const remove=async(id:string)=>{
    const children=byParent[id]||[];
    if(children.length){
      return toast.error("Move or deactivate the sub-locations first");
    }
    if(!confirm("Deactivate this location? Existing asset and history records will be kept.")) return;
    const {error}=await (supabase as any).from("locations").update({is_active:false}).eq("id",id);
    if(error) return toast.error(error.message);
    onChanged();toast.success("Location deactivated");
  };

  const render=(l:any,depth=0):any=>(
    <div key={l.id}>
      <div className="group flex items-center justify-between gap-3 border-b px-3 py-3 last:border-0" style={{paddingLeft:12+depth*22}}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {depth>0 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground"/>}
            <p className="font-medium">{l.name}</p>
            <Badge variant="outline">{TYPE_LABEL[l.location_type]||l.location_type}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {l.branches?.name ? `${l.branches.name} · ` : ""}{l.geo_places?.display_path || l.address || (l.parent_id ? "Sub-location" : "Organisation location")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant={assetsForLocation(l.id).length ? "outline" : "ghost"}
            onClick={()=>onViewAssets(l.id)}
            title="View assets in this location and its sub-locations"
          >
            <Package className="mr-1 h-4 w-4"/>
            {assetsForLocation(l.id).length}
            <span className="hidden sm:inline ml-1">assets</span>
            <ArrowUpRight className="ml-1 h-3.5 w-3.5"/>
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={()=>openNew(l)} title="Add sub-location">
                <Plus className="mr-1 h-4 w-4"/><span className="hidden sm:inline">Sub-location</span>
              </Button>
              <Button size="icon" variant="ghost" onClick={()=>openEdit(l)} title="Edit location">
                <Pencil className="h-4 w-4"/>
              </Button>
              {canWrite && (
                <Button size="icon" variant="ghost" onClick={()=>remove(l.id)} title="Deactivate location">
                  <Trash2 className="h-4 w-4 text-destructive"/>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {(byParent[l.id]||[]).map((c:any)=>render(c,depth+1))}
    </div>
  );

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <div>
        <CardTitle>Organisation locations</CardTitle>
        <p className="text-sm text-muted-foreground">Build your real structure: site → building → floor → room/store/office.</p>
      </div>
      {canEdit && <Button onClick={()=>openNew()}><Plus className="mr-2 h-4 w-4"/>Add top-level location</Button>}
    </CardHeader>
    <CardContent className="p-0">
      {queryError ? (
        <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Locations could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">{queryError?.message || "Please retry."}</p>
        </div>
      ) : locations.length ? (
        (byParent.root||[]).map((l:any)=>render(l))
      ) : (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">No organisation locations yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Start with a site, branch, building or store.</p>
        </div>
      )}
    </CardContent>

    <Dialog open={open} onOpenChange={(next)=>{setOpen(next);if(!next)resetForm();}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit location" : parent ? "Add sub-location" : "Add location"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {parent && !editingId && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              Parent: <strong>{locations.find((l:any)=>l.id===parent)?.name}</strong>
            </div>
          )}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={e=>setName(e.target.value)} placeholder={type==="room" ? "e.g. Room 204" : "e.g. Main Building, Finance Store"}/>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_LABEL).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={branch||"none"} onValueChange={v=>setBranch(v==="none"?"":v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{parent ? "Inherit from parent" : "No branch"}</SelectItem>
                  {branches.map((b:any)=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {editingId && (
            <div className="space-y-2">
              <Label>Parent location</Label>
              <Select value={parent||"none"} onValueChange={v=>setParent(v==="none"?"":v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Top level</SelectItem>
                  {locations
                    .filter((l:any)=>l.id!==editingId && !descendantsOf(editingId).has(l.id))
                    .map((l:any)=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
          <Button onClick={saveLocation}>{editingId ? "Save changes" : "Create location"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}

const GEO_PRIMARY: Record<string,{level:number;label:string}> = {
  UG:{level:2,label:"District"},
  KE:{level:1,label:"County"},
  TZ:{level:1,label:"Region"},
  RW:{level:2,label:"District"},
  ZM:{level:1,label:"Province"},
  MW:{level:2,label:"District"},
  ZW:{level:1,label:"Province"},
};

function GeographyBrowser({countries,assets,onViewAssets}:{countries:any[];assets:any[];onViewAssets:(id:number)=>void}) {
  const [country,setCountry]=useState("");
  const [stack,setStack]=useState<any[]>([]);
  const parent=stack.length?stack[stack.length-1]:null;
  const config=GEO_PRIMARY[country] ?? {level:1,label:"Region"};

  const {data:rawPlaces=[],isLoading}=useQuery({
    queryKey:["geo-browser-hierarchy",country,parent?.geoname_id,config.level],
    enabled:!!country,
    queryFn:async()=>{
      let q=(supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,population,parent_geoname_id,country_code")
        .eq("country_code",country);
      if(parent) q=q.eq("parent_geoname_id",parent.geoname_id).order("feature_class",{ascending:true}).order("name").limit(1500);
      else q=q.eq("feature_code",`ADM${config.level}`).order("name").limit(1200);
      const {data,error}=await q;
      if(error) throw error;
      return data??[];
    }
  });

  const places=useMemo(()=>{
    if(!parent) return rawPlaces as any[];
    const admin=(rawPlaces as any[]).filter((p:any)=>p.feature_class==="A");
    return admin.length ? admin : (rawPlaces as any[]).filter((p:any)=>p.feature_class==="P");
  },[rawPlaces,parent?.geoname_id]);

  const countAssets=(p:any)=>assets.filter((a:any)=>{
    if(!a.geo_place_id) return false;
    if(Number(a.geo_place_id)===Number(p.geoname_id)) return true;
    const assetPath=String(a.geo_places?.display_path||"");
    const target=String(p.display_path||"");
    return !!assetPath && !!target && assetPath.endsWith(target);
  }).length;

  const countryCount=(code:string)=>assets.filter((a:any)=>a.geo_place_id && a.geo_places?.country_code===code).length;

  useEffect(()=>{
    if(!parent || isLoading || places.length!==1) return;
    const only=places[0];
    if(only.feature_class!=="A") return;
    if(stack.some((p:any)=>p.geoname_id===only.geoname_id)) return;
    setStack(current=>[...current,only]);
  },[parent?.geoname_id,isLoading,places.length]);

  const chooseCountry=(code:string)=>{setCountry(code);setStack([]);};
  const enter=(p:any)=>setStack(current=>[...current,p]);
  const goTo=(index:number)=>setStack(current=>current.slice(0,index+1));
  const back=()=>setStack(current=>current.slice(0,-1));

  if(!country) {
    return <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary"/>Geographic locations</CardTitle>
        <p className="text-sm text-muted-foreground">Choose a country, then drill down to a district, county, region or local area. Asset counts follow you at every level.</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c:any)=>(
            <button key={c.code} type="button" onClick={()=>chooseCountry(c.code)}
              className="group rounded-xl border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-primary/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Open geographic hierarchy</p>
                </div>
                <Badge variant={countryCount(c.code)>0?"default":"outline"}>{countryCount(c.code)} assets</Badge>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                Browse {c.name}<ChevronRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5"/>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>;
  }

  const selectedCountry=countries.find((c:any)=>c.code===country);
  const selected=stack[stack.length-1]??null;
  const selectedCount=selected?countAssets(selected):countryCount(country);

  return <Card>
    <CardHeader className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary"/>{selectedCountry?.name||country}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {stack.length ? `Choose a lower area, or use ${selected?.name} at the current level.` : `Choose a ${config.label.toLowerCase()} to continue.`}
          </p>
        </div>
        <div className="flex gap-2">
          {selected && selectedCount>0 && (
            <Button size="sm" onClick={()=>onViewAssets(Number(selected.geoname_id))}>
              <Package className="mr-2 h-4 w-4"/>View {selectedCount} assets
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={()=>{setCountry("");setStack([]);}}>Change country</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/35 px-2 py-1.5 text-xs">
        <button type="button" className="rounded px-2 py-1 font-medium hover:bg-background" onClick={()=>setStack([])}>
          {selectedCountry?.name||country}
        </button>
        {stack.map((p:any,i:number)=>(
          <span key={p.geoname_id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground"/>
            <button type="button" onClick={()=>goTo(i)} className="rounded px-2 py-1 font-medium hover:bg-background">{p.name}</button>
          </span>
        ))}
      </div>
    </CardHeader>

    <CardContent className="space-y-3">
      {stack.length>0 && <Button variant="ghost" size="sm" onClick={back}><ChevronLeft className="mr-1 h-4 w-4"/>Back one level</Button>}

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {stack.length===0?config.label:"Areas inside "+selected?.name}
        </p>
        <p className="text-xs text-muted-foreground">{places.length} option{places.length===1?"":"s"}</p>
      </div>

      <div className="grid max-h-[560px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? <p className="col-span-full p-8 text-center text-sm text-muted-foreground">Loading areas...</p> :
        places.length===0 ? <div className="col-span-full rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No lower administrative areas available.</p>
          <p className="mt-1 text-xs text-muted-foreground">Use the current area to view its assets.</p>
          {selected && selectedCount>0 && <Button className="mt-4" onClick={()=>onViewAssets(Number(selected.geoname_id))}>View {selectedCount} assets</Button>}
        </div> :
        places.map((p:any)=>{
          const count=countAssets(p);
          return <div key={p.geoname_id} className="group rounded-xl border bg-background p-3 transition hover:border-primary/35 hover:bg-primary/[0.03]">
            <button type="button" onClick={()=>enter(p)} className="w-full text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{p.display_path}</p>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>
              </div>
            </button>
            <div className="mt-3 flex items-center justify-between border-t pt-2">
              <Badge variant={count>0?"default":"outline"}>{count} asset{count===1?"":"s"}</Badge>
              {count>0 && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={()=>onViewAssets(Number(p.geoname_id))}>View assets</Button>}
            </div>
          </div>;
        })}
      </div>
    </CardContent>
  </Card>;
}

