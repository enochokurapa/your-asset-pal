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
import { Building2, Globe2, MapPin, Plus, ChevronRight, ChevronLeft, Radar, Trash2 } from "lucide-react";
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
  const trackingEnabled = canView("live_tracking");
  const qc = useQueryClient();

  const { data: locations = [] } = useQuery({
    queryKey:["locations"],
    queryFn:async()=> (await (supabase as any).from("locations")
      .select("*, branches(name,code), geo_places(name,display_path)")
      .eq("is_active",true).order("name")).data ?? [],
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Organisation locations" value={locations.length} />
        <Metric label="Geo mapped" value={mapped} />
        <Metric label="Countries loaded" value={countries.length} />
        <Metric label="Live tracking" value={trackingEnabled ? "Enabled" : "Off"} />
      </div>

      <Tabs defaultValue="organisation">
        <TabsList>
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
          <TabsTrigger value="tracking">Live tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="organisation" className="pt-4">
          <OrganisationLocations locations={locations as any[]} branches={branches as any[]} canEdit={canEdit} canWrite={canWrite} onChanged={()=>qc.invalidateQueries({queryKey:["locations"]})} />
        </TabsContent>

        <TabsContent value="geography" className="pt-4">
          <GeographyBrowser countries={countries as any[]} />
        </TabsContent>

        <TabsContent value="tracking" className="pt-4">
          <Card>
            <CardContent className="flex min-h-48 items-center justify-center p-6 text-center">
              <div className="max-w-lg">
                <Radar className="mx-auto h-9 w-9 text-primary" />
                <h3 className="mt-3 font-semibold">Live tracking foundation is installed</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tracker devices, telemetry events and asset links are ready. The module is currently switched off at platform level and cannot collect live tracking data until the SaaS administrator enables it.
                </p>
                <Badge variant="outline" className="mt-3">{trackingEnabled ? "Module enabled" : "Module disabled"}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({label,value}:{label:string;value:string|number}) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></Card>;
}

function OrganisationLocations({locations,branches,canEdit,canWrite,onChanged}:{locations:any[];branches:any[];canEdit:boolean;canWrite:boolean;onChanged:()=>void}) {
  const [open,setOpen]=useState(false);
  const [name,setName]=useState("");
  const [type,setType]=useState("office");
  const [branch,setBranch]=useState("");
  const [parent,setParent]=useState("");

  const create=async()=>{
    if(!name.trim()) return toast.error("Location name is required");
    const {error}=await (supabase as any).from("locations").insert({
      name:name.trim(),location_type:type,branch_id:branch||null,parent_id:parent||null,
      is_active:true,is_structured:true,location_source:"manual",
    });
    if(error) return toast.error(error.message);
    setOpen(false);setName("");setBranch("");setParent("");setType("office");onChanged();toast.success("Location created");
  };

  const remove=async(id:string)=>{
    if(!confirm("Deactivate this organisation location? Existing asset history will be kept.")) return;
    const {error}=await (supabase as any).from("locations").update({is_active:false}).eq("id",id);
    if(error) return toast.error(error.message);
    onChanged();toast.success("Location deactivated");
  };

  const byParent=useMemo(()=>{
    const m:Record<string,any[]>={};
    locations.forEach(l=>(m[l.parent_id||"root"] ||= []).push(l));
    return m;
  },[locations]);

  const render=(l:any,depth=0):any=>(
    <div key={l.id}>
      <div className="flex items-center justify-between gap-3 border-b px-3 py-3 last:border-0" style={{paddingLeft:12+depth*22}}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{l.name}</p>
            <Badge variant="outline">{TYPE_LABEL[l.location_type]||l.location_type}</Badge>
            {l.geo_place_id && <Badge variant="secondary">Geo mapped</Badge>}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {l.branches?.name ? `${l.branches.name} · ` : ""}{l.geo_places?.display_path || l.address || "Organisation location"}
          </p>
        </div>
        {canWrite && <Button size="icon" variant="ghost" onClick={()=>remove(l.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>}
      </div>
      {(byParent[l.id]||[]).map((c)=>render(c,depth+1))}
    </div>
  );

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <div><CardTitle>Organisation structure</CardTitle><p className="text-sm text-muted-foreground">Sites, buildings, offices, stores, archives, rooms and field sites.</p></div>
      {canEdit && <Button onClick={()=>setOpen(true)}><Plus className="mr-2 h-4 w-4"/>Add location</Button>}
    </CardHeader>
    <CardContent className="p-0">
      {locations.length ? (byParent.root||[]).map((l)=>render(l)) : <p className="p-8 text-center text-sm text-muted-foreground">No organisation locations yet.</p>}
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add organisation location</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Finance Store, Floor 2, Kampala HQ…"/></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label>Type</Label>
              <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
                {Object.entries(TYPE_LABEL).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Branch</Label>
              <Select value={branch||"none"} onValueChange={v=>setBranch(v==="none"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
                <SelectItem value="none">No branch</SelectItem>{branches.map(b=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent></Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Parent location</Label>
            <Select value={parent||"none"} onValueChange={v=>setParent(v==="none"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
              <SelectItem value="none">Top level</SelectItem>{locations.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent></Select>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
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
