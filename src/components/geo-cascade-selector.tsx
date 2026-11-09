import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search,MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENT_ADMIN_CONFIG, currentAdminSource } from "@/lib/current-admin-sources";

type GeoPlace = {
  geoname_id: number;
  name: string;
  display_path: string | null;
  feature_class: string;
  feature_code: string;
  admin_level: number | null;
  admin1_code: string | null;
  admin2_code: string | null;
  admin3_code: string | null;
  admin4_code: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  parent_geoname_id: number | null;
};

function nextLabel(place: GeoPlace | null, hasAdminChildren: boolean, depth: number) {
  if (!place) return "Area";
  if (hasAdminChildren) {
    if (depth === 0) return "Subdivision";
    if (depth === 1) return "Sub-area";
    return "Local administrative area";
  }
  return "Administrative area";
}

async function fetchChildren(parentId:number) {
  const { data, error } = await (supabase as any).from("geo_places")
    .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id")
    .eq("parent_geoname_id", parentId)
    .order("feature_class", { ascending: true })
    .order("name")
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as GeoPlace[];
  return rows.filter((p) => p.feature_class === "A");
}

function GenericGeoCascadeSelector({
  countryCode,
  value,
  onChange,
  required=false,
}:{
  countryCode:string;
  value:number|null;
  onChange:(place:GeoPlace|null)=>void;
  required?:boolean;
}) {
  const config = {level:1,label:CURRENT_ADMIN_CONFIG[countryCode]?.level===1?CURRENT_ADMIN_CONFIG[countryCode].label:"Region / state / province"};
  const [path,setPath]=useState<GeoPlace[]>([]);


  const {data:adminAreas=[]}=useQuery({
    queryKey:["geo-admin-options",countryCode,config.level],
    queryFn:async()=>{
      let q=(supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id,source")
        .eq("country_code",countryCode)
        .eq("feature_code",`ADM${config.level}`);
      const {data,error}=await q.order("name").limit(1000);
      if(error) throw error;
      // Existing countries may have official and GeoNames rows for the same
      // division. Prefer GeoNames parent IDs for a navigable hierarchy.
      const candidates=(data??[]) as (GeoPlace & {source?:string})[];
      const unique=new Map<string,GeoPlace>();
      for(const area of candidates){
        const k=area.name.toLocaleLowerCase();
        const previous=unique.get(k) as (GeoPlace&{source?:string})|undefined;
        if(!previous || ((area.source==="geonames" || area.source==="geonames-global") && previous.source!=="geonames" && previous.source!=="geonames-global"))unique.set(k,area);
      }
      return [...unique.values()];
    }
  });

  const {data:selectedPlace}=useQuery({
    queryKey:["geo-cascade-selected",value],
    enabled:!!value,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id")
        .eq("geoname_id",value).maybeSingle();
      if(error) throw error;
      return data as GeoPlace|null;
    }
  });

  useEffect(()=>{
    setPath([]);
  },[countryCode]);

  useEffect(()=>{
    if(!selectedPlace || !adminAreas.length || path.length) return;
    const primary = (adminAreas as GeoPlace[]).find(a => {
      if (config.level === 1) return countryCode==="UG"?Boolean(a.name&&selectedPlace.display_path?.includes(a.name)):Boolean(a.admin1_code && a.admin1_code === selectedPlace.admin1_code);
      if (config.level === 2) return a.admin1_code === selectedPlace.admin1_code && a.admin2_code === selectedPlace.admin2_code;
      return false;
    });
    if (primary) {
      setPath(primary.geoname_id === selectedPlace.geoname_id ? [primary] : [primary, selectedPlace]);
    }
  },[selectedPlace,adminAreas,path.length,config.level]);

  const primary = path[0] ?? null;
  const level1Parent = path[0] ?? null;
  const level2Parent = path[1] ?? null;
  const level3Parent = path[2] ?? null;
  const level4Parent = path[3] ?? null;

  const {data:level1Children=[]}=useQuery({
    queryKey:["geo-child-options",level1Parent?.geoname_id],
    enabled:!!level1Parent,
    queryFn:()=>fetchChildren(level1Parent!.geoname_id),
  });
  const {data:level2Children=[]}=useQuery({
    queryKey:["geo-child-options",level2Parent?.geoname_id],
    enabled:!!level2Parent,
    queryFn:()=>fetchChildren(level2Parent!.geoname_id),
  });
  const {data:level3Children=[]}=useQuery({
    queryKey:["geo-child-options",level3Parent?.geoname_id],
    enabled:!!level3Parent,
    queryFn:()=>fetchChildren(level3Parent!.geoname_id),
  });
  const {data:level4Children=[]}=useQuery({
    queryKey:["geo-child-options",level4Parent?.geoname_id],
    enabled:!!level4Parent,
    queryFn:()=>fetchChildren(level4Parent!.geoname_id),
  });

  const childSets = [level1Children,level2Children,level3Children,level4Children] as GeoPlace[][];

  useEffect(()=>{
    // If GeoNames contains one administrative bridge only (common for cities/counties),
    // skip it automatically so field workers don't repeat the same place name.
    if (!primary || path.length !== 1 || level1Children.length !== 1) return;
    const only = level1Children[0];
    if (only.feature_class === "A") {
      setPath([primary, only]);
      onChange(only);
    }
  },[primary?.geoname_id, level1Children.length]);

  const choosePrimary=(id:string)=>{
    const place=(adminAreas as GeoPlace[]).find(a=>String(a.geoname_id)===id) ?? null;
    setPath(place ? [place] : []);
    onChange(place);
  };

  const chooseChild=(depth:number,id:string)=>{
    const options=childSets[depth-1] ?? [];
    const place=options.find(p=>String(p.geoname_id)===id) ?? null;
    const next=path.slice(0,depth);
    if(place) next.push(place);
    setPath(next);
    onChange(place ?? next[next.length-1] ?? null);
  };

  const renderedLevels = useMemo(()=>{
    const rows:{parent:GeoPlace; options:GeoPlace[]; depth:number}[]=[];
    for(let i=0;i<4;i++){
      const parent=path[i];
      const options=childSets[i] ?? [];
      if(!parent || !options.length) break;
      rows.push({parent,options,depth:i+1});
      if(!path[i+1]) break;
    }
    return rows;
  },[path,level1Children,level2Children,level3Children,level4Children]);

  return <div className="space-y-3">
    <div className="space-y-2">
      <Label>{config.label} {required?"*":""}</Label>
      <Select value={primary ? String(primary.geoname_id) : ""} onValueChange={choosePrimary}>
        <SelectTrigger><SelectValue placeholder={`Select ${config.label.toLowerCase()}…`} /></SelectTrigger>
        <SelectContent className="max-h-72">
          {(adminAreas as GeoPlace[]).map((a)=><SelectItem key={a.geoname_id} value={String(a.geoname_id)}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    {renderedLevels.map(({parent,options,depth})=>{
      const selected=path[depth] ?? null;
      const hasAdminChildren=options.some(o=>o.feature_class==="A");
      return <div key={parent.geoname_id} className="space-y-2">
        <Label>{countryCode==="UG"&&depth===1?"District":nextLabel(parent,hasAdminChildren,depth-1)}</Label>
        <Select value={selected ? String(selected.geoname_id) : "none"} onValueChange={(v)=>chooseChild(depth,v==="none"?"":v)}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="none">Use {parent.name}</SelectItem>
            {options.map((p)=><SelectItem key={p.geoname_id} value={String(p.geoname_id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>;
    })}

    {primary && (
      <p className="text-xs text-muted-foreground">
        Stop at any administrative level that is sufficient. Use a custom organisation place for the exact site, building, office, room or locally known place.
      </p>
    )}
    <p className="text-[11px] text-muted-foreground">Geographic reference: <a className="underline hover:text-primary" href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>. Coverage varies by country.</p>
  </div>;
}

/** Uganda's official geographic hierarchy. UBOS district rows do not carry
 * admin1_code, so match their canonical display_path to the four regions.
 * This avoids empty district menus and mixed regional results on mobile. */
function UgandaGeoCascadeSelector({value,onChange,required=false}:{value:number|null;onChange:(place:GeoPlace|null)=>void;required?:boolean}){
 const [regionId,setRegionId]=useState<string>("");
 const [search,setSearch]=useState("");
 const {data:regions=[],isPending:loadingRegions,isError:regionsError,refetch:retryRegions}=useQuery({
  queryKey:["geo-uganda-region-v3"],
  queryFn:async()=>{
   const {data,error}=await (supabase as any).from("geo_places")
    .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id")
    .eq("country_code","UG").eq("feature_code","ADM1").order("name");
   if(error)throw error;
   return data as GeoPlace[];
  },
 });
 const {data:districts=[],isPending:loadingDistricts,isError:districtsError,refetch:retryDistricts}=useQuery({
  queryKey:["geo-uganda-all-districts-v3"],
  queryFn:async()=>{
   const all:GeoPlace[]=[];
   for(let offset=0;offset<400;offset+=200){
    const {data,error}=await (supabase as any).from("geo_places")
     .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id")
     .eq("country_code","UG").eq("feature_code","ADM2").eq("source","UBOS NPHC 2024")
     .order("name").range(offset,offset+199);
    if(error)throw error;
    all.push(...(data??[]));
    if((data?.length??0)<200)break;
   }
   return all;
  }
 });
 const {data:existingPlace}=useQuery({
  queryKey:["geo-uganda-selected-v3",value],enabled:!!value,
  queryFn:async()=>{
   const {data,error}=await (supabase as any).from("geo_places")
    .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id")
    .eq("geoname_id",value).maybeSingle();
   if(error)throw error;
   return data as GeoPlace|null;
  },
 });
 const inferRegion=(place:GeoPlace|null|undefined)=>{
  if(!place)return "";
  const location=place.display_path||"";
  const matched=regions.find(r=>r.geoname_id===place.geoname_id||location.split(" · ").some(part=>part.trim().toLowerCase()===r.name.toLowerCase()));
  return matched?String(matched.geoname_id):"";
 };
 useEffect(()=>{
  if(!regions.length)return;
  if(!value){setRegionId("");return;}
  if(existingPlace&&Number(existingPlace.geoname_id)===Number(value))setRegionId(inferRegion(existingPlace));
 },[value,existingPlace?.geoname_id,regions]);
 const region=regions.find(item=>String(item.geoname_id)===regionId);
 const available=useMemo(()=>region?districts.filter(d=>(d.display_path||"").split(" · ").some(part=>part.trim().toLowerCase()===region.name.toLowerCase())):districts,[region?.geoname_id,districts]);
 // A typed search must search every district in the country, even when a
 // previous region was selected. Choosing a hit updates the region too.
 const matches=useMemo(()=>districts.filter(d=>{
  const query=search.trim().toLowerCase();
  return query?`${d.name} ${d.display_path??""}`.toLowerCase().includes(query):available.includes(d);
 }).sort((a,b)=>a.name.localeCompare(b.name)),[available,districts,search]);
 const selectedDistrict=districts.find(d=>Number(d.geoname_id)===Number(value));
 return <div className="space-y-3 rounded-xl border bg-white p-3 sm:p-4">
  <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary"/> Uganda · Geographic location</p>
  <div className="space-y-1.5"><Label>1. Region (optional filter)</Label>
   <Select value={regionId||"none"} onValueChange={id=>{setRegionId(id==="none"?"":id);setSearch("");onChange(null);}}>
    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Choose region"/></SelectTrigger>
    <SelectContent><SelectItem value="none">All regions (entire country)</SelectItem>{regions.map(r=><SelectItem key={r.geoname_id} value={String(r.geoname_id)}>{r.name}</SelectItem>)}</SelectContent>
   </Select>
  </div>
  {loadingRegions&&<p className="text-xs text-muted-foreground">Loading regions…</p>}
  {regionsError&&<button type="button" className="text-sm text-destructive underline" onClick={()=>void retryRegions()}>Could not load regions · Retry</button>}
  <div className="space-y-2">
   <Label>2. District {required?"*":""} · {districts.length} available nationwide</Label>
   <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/>
    <Input className="h-11 w-full pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search all districts in Uganda" aria-label="Search districts nationwide"/>
   </div>
   <Select value={selectedDistrict?String(selectedDistrict.geoname_id):"none"} onValueChange={id=>{const place=districts.find(d=>String(d.geoname_id)===id)??null;onChange(place);if(place)setRegionId(inferRegion(place));setSearch("");}}>
    <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Choose district"/></SelectTrigger>
    <SelectContent className="max-h-64"><SelectItem value="none">Choose district</SelectItem>
     {matches.map(d=><SelectItem key={d.geoname_id} value={String(d.geoname_id)}>{d.name}{d.name.toLowerCase().endsWith("district")?"":" District"}</SelectItem>)}
    </SelectContent>
   </Select>
   {!loadingDistricts&&!districtsError&&<p className="text-xs text-muted-foreground">{matches.length} matching districts {search?"across Uganda":region?`in ${region.name}`:"across Uganda"}</p>}
   {loadingDistricts&&<p className="text-xs text-muted-foreground">Loading districts…</p>}
   {districtsError&&<button type="button" className="text-sm text-destructive underline" onClick={()=>void retryDistricts()}>Could not load districts · Retry</button>}
   {!loadingDistricts&&!districtsError&&!districts.length&&<p className="text-xs text-destructive">District data is unavailable. Please retry.</p>}
   {selectedDistrict&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">Selected: Uganda / {selectedDistrict.display_path||selectedDistrict.name}</p>}
   <p className="text-[11px] text-muted-foreground">Districts: UBOS NPHC 2024 · Geographic reference: <a className="underline" href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a></p>
  </div>
 </div>;
}

export function GeoCascadeSelector(props:{countryCode:string;value:number|null;onChange:(place:GeoPlace|null)=>void;required?:boolean}){
 return props.countryCode==="UG"?<UgandaGeoCascadeSelector value={props.value} onChange={props.onChange} required={props.required}/>:<GenericGeoCascadeSelector {...props}/>;
}
