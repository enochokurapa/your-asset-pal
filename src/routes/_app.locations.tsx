import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Globe2, Plus, ChevronRight, ChevronLeft, Trash2, Pencil, CornerDownRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/locations")({ component: LocationsPage });

const TYPE_LABEL: Record<string,string> = {
  site:"Site", branch:"Branch", building:"Building", floor:"Floor", department:"Department",
  office:"Office", room:"Room", store:"Store", warehouse:"Warehouse", archive:"Archive",
  field_site:"Field site", area:"Area", other:"Other",
};

function LocationsPage() {
  const { canWrite, canDo, canView, isTenantAdmin } = useAuth();
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

  const mapped = (locations as any[]).filter((l)=>l.geo_place_id || (l.latitude!=null && l.longitude!=null)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
        <p className="text-sm text-muted-foreground">Organisation locations and the global geography used by assets, movements and verification.</p>
      </div>

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
            onChanged={() => {
              qc.invalidateQueries({queryKey:["locations"]});
              qc.invalidateQueries({queryKey:["locations-list"]});
            }}
          />
        </TabsContent>

        <TabsContent value="geography" className="pt-4">
          <GeographyBrowser countries={countries as any[]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrganisationLocations({
  locations, branches, canEdit, canWrite, queryError, onChanged,
}:{
  locations:any[]; branches:any[]; canEdit:boolean; canWrite:boolean; queryError:any; onChanged:()=>void;
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
        {canEdit && (
          <div className="flex shrink-0 gap-1">
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
          </div>
        )}
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

function GeographyBrowser({countries}:{countries:any[]}) {
  const [country,setCountry]=useState("UG");
  const [search,setSearch]=useState("");
  const [stack,setStack]=useState<any[]>([]);
  const parent=stack.length?stack[stack.length-1].geoname_id:null;

  const {data:places=[],isLoading}=useQuery({
    queryKey:["geo-browser",country,parent,search],
    queryFn:async()=>{
      let q=(supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_code,admin_level,population,parent_geoname_id")
        .eq("country_code",country);
      if(search.trim().length>=2) q=q.ilike("name",`%${search.trim()}%`).order("population",{ascending:false}).limit(100);
      else if(parent) q=q.eq("parent_geoname_id",parent).order("admin_level",{ascending:true}).order("name").limit(500);
      else q=q.is("parent_geoname_id",null).eq("feature_class","A").order("name").limit(500);
      const {data,error}=await q;if(error) throw error;return data??[];
    }
  });

  const enter=(p:any)=>{setStack(s=>[...s,p]);setSearch("");};
  const back=()=>{setStack(s=>s.slice(0,-1));setSearch("");};

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary"/>Global geography</CardTitle>
      <p className="text-sm text-muted-foreground">Browse or search the full imported geography. This data is shared system-wide; organisations only add their own internal sites and rooms.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <Select value={country} onValueChange={v=>{setCountry(v);setStack([]);setSearch("");}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          {countries.map(c=><SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
        </SelectContent></Select>
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search any district, city, town, locality or village…"/>
      </div>

      {stack.length>0 && <div className="flex flex-wrap items-center gap-1 text-sm">
        <Button variant="ghost" size="sm" onClick={back}><ChevronLeft className="mr-1 h-4 w-4"/>Back</Button>
        {stack.map((p,i)=><span key={p.geoname_id} className="flex items-center gap-1 text-muted-foreground">{i>0&&<ChevronRight className="h-3 w-3"/>}{p.name}</span>)}
      </div>}

      <div className="max-h-[520px] overflow-y-auto rounded-lg border">
        {isLoading ? <p className="p-6 text-center text-sm text-muted-foreground">Loading geography…</p> :
        places.length===0 ? <p className="p-6 text-center text-sm text-muted-foreground">No places found.</p> :
        places.map((p:any)=><button key={p.geoname_id} type="button" onClick={()=>enter(p)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-muted/40">
          <div className="min-w-0"><p className="font-medium">{p.name}</p><p className="truncate text-xs text-muted-foreground">{p.display_path}</p></div>
          <div className="flex items-center gap-2"><Badge variant="outline">{p.feature_code}</Badge><ChevronRight className="h-4 w-4 text-muted-foreground"/></div>
        </button>)}
      </div>
    </CardContent>
  </Card>;
}
