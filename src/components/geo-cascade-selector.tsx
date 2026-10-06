import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
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

export function GeoCascadeSelector({
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
  const config = CURRENT_ADMIN_CONFIG[countryCode] ?? {level:1,label:"Region"};
  const [path,setPath]=useState<GeoPlace[]>([]);

  const {data:adminAreas=[]}=useQuery({
    queryKey:["geo-admin-options",countryCode,config.level],
    queryFn:async()=>{
      let q=(supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population,parent_geoname_id")
        .eq("country_code",countryCode)
        .eq("feature_code",`ADM${config.level}`);
      const source=currentAdminSource(countryCode);
      if(source) q=q.eq("source",source);
      const {data,error}=await q.order("name").limit(1000);
      if(error) throw error;
      return (data??[]) as GeoPlace[];
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
      if (config.level === 1) return a.admin1_code && a.admin1_code === selectedPlace.admin1_code;
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
    enabled:!!level1Parent && !currentAdminSource(countryCode),
    queryFn:()=>fetchChildren(level1Parent!.geoname_id),
  });
  const {data:level2Children=[]}=useQuery({
    queryKey:["geo-child-options",level2Parent?.geoname_id],
    enabled:!!level2Parent && !currentAdminSource(countryCode),
    queryFn:()=>fetchChildren(level2Parent!.geoname_id),
  });
  const {data:level3Children=[]}=useQuery({
    queryKey:["geo-child-options",level3Parent?.geoname_id],
    enabled:!!level3Parent && !currentAdminSource(countryCode),
    queryFn:()=>fetchChildren(level3Parent!.geoname_id),
  });
  const {data:level4Children=[]}=useQuery({
    queryKey:["geo-child-options",level4Parent?.geoname_id],
    enabled:!!level4Parent && !currentAdminSource(countryCode),
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
        <Label>{nextLabel(parent,hasAdminChildren,depth-1)}</Label>
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
  </div>;
}
