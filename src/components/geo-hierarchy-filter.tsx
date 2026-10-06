import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type GeoHierarchyPlace = {
  geoname_id: number;
  name: string;
  display_path: string | null;
  feature_class: string;
  feature_code: string;
  admin_level: number | null;
  parent_geoname_id: number | null;
  country_code: string;
};

const COUNTRY_ADMIN: Record<string,{level:number;label:string}> = {
  UG:{level:2,label:"District"},
  KE:{level:1,label:"County"},
  TZ:{level:1,label:"Region"},
  RW:{level:2,label:"District"},
  ZM:{level:1,label:"Province"},
  MW:{level:2,label:"District"},
  ZW:{level:1,label:"Province"},
};

function nextLabel(depth:number, options:GeoHierarchyPlace[]) {
  const hasAdmin=options.some(p=>p.feature_class==="A");
  if (!hasAdmin) return depth <= 2 ? "Town / locality" : "Local area";
  if (depth === 1) return "Subdivision";
  if (depth === 2) return "Sub-area";
  return "Local administrative area";
}

async function children(parentId:number) {
  const {data,error}=await (supabase as any).from("geo_places")
    .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,parent_geoname_id,country_code")
    .eq("parent_geoname_id",parentId)
    .order("feature_class",{ascending:true})
    .order("name")
    .limit(1500);
  if(error) throw error;
  const rows=(data??[]) as GeoHierarchyPlace[];
  const admin=rows.filter(p=>p.feature_class==="A");
  return admin.length ? admin : rows.filter(p=>p.feature_class==="P");
}

export function GeoHierarchyFilter({
  countries,
  value,
  onChange,
  initialCountry,
  compact=false,
}:{
  countries:Array<{code:string;name:string}>;
  value:GeoHierarchyPlace|null;
  onChange:(place:GeoHierarchyPlace|null)=>void;
  initialCountry?:string;
  compact?:boolean;
}) {
  const [country,setCountry]=useState(initialCountry || value?.country_code || countries[0]?.code || "UG");
  const [path,setPath]=useState<GeoHierarchyPlace[]>([]);
  const config=COUNTRY_ADMIN[country] ?? {level:1,label:"Region"};

  const {data:primary=[]}=useQuery({
    queryKey:["geo-hierarchy-primary",country,config.level],
    enabled:!!country,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,parent_geoname_id,country_code")
        .eq("country_code",country)
        .eq("feature_code",`ADM${config.level}`)
        .order("name")
        .limit(1200);
      if(error) throw error;
      return (data??[]) as GeoHierarchyPlace[];
    }
  });

  useEffect(()=>{
    setPath([]);
    onChange(null);
  },[country]);

  const parents=[path[0],path[1],path[2],path[3],path[4]];
  const queries=parents.map((parent,index)=>useQuery({
    queryKey:["geo-hierarchy-child",parent?.geoname_id,index],
    enabled:!!parent,
    queryFn:()=>children(parent!.geoname_id),
  }));
  const childSets=queries.map(q=>(q.data??[]) as GeoHierarchyPlace[]);

  useEffect(()=>{
    if(!path.length) return;
    const depth=path.length-1;
    const options=childSets[depth] ?? [];
    if(options.length!==1) return;
    const only=options[0];
    if(only.feature_class!=="A") return;
    if(path.some(p=>p.geoname_id===only.geoname_id)) return;
    const next=[...path,only];
    setPath(next);
    onChange(only);
  },[path.map(p=>p.geoname_id).join(","), childSets.map(x=>x.length).join(",")]);

  const choosePrimary=(id:string)=>{
    const place=primary.find(p=>String(p.geoname_id)===id) ?? null;
    setPath(place?[place]:[]);
    onChange(place);
  };

  const chooseChild=(depth:number,id:string)=>{
    const options=childSets[depth-1] ?? [];
    if(id==="__parent") {
      const next=path.slice(0,depth);
      setPath(next);
      onChange(next[next.length-1] ?? null);
      return;
    }
    const place=options.find(p=>String(p.geoname_id)===id) ?? null;
    const next=path.slice(0,depth);
    if(place) next.push(place);
    setPath(next);
    onChange(place ?? next[next.length-1] ?? null);
  };

  const rendered=useMemo(()=>{
    const out:Array<{parent:GeoHierarchyPlace;options:GeoHierarchyPlace[];depth:number}>=[];
    for(let i=0;i<5;i++){
      const parent=path[i];
      const options=childSets[i]??[];
      if(!parent || !options.length) break;
      out.push({parent,options,depth:i+1});
      if(!path[i+1]) break;
    }
    return out;
  },[path,...childSets]);

  return <div className={compact?"grid gap-3 md:grid-cols-2 xl:grid-cols-3":"space-y-3"}>
    <div className="space-y-1.5">
      <Label className="text-xs">Country</Label>
      <Select value={country} onValueChange={setCountry}>
        <SelectTrigger className={compact?"h-9":""}><SelectValue/></SelectTrigger>
        <SelectContent className="max-h-72">
          {countries.map(c=><SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-1.5">
      <Label className="text-xs">{config.label}</Label>
      <Select value={path[0]?String(path[0].geoname_id):""} onValueChange={choosePrimary}>
        <SelectTrigger className={compact?"h-9":""}><SelectValue placeholder={`Select ${config.label.toLowerCase()}`}/></SelectTrigger>
        <SelectContent className="max-h-72">
          {primary.map(p=><SelectItem key={p.geoname_id} value={String(p.geoname_id)}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    {rendered.map(({parent,options,depth})=>{
      const selected=path[depth] ?? null;
      return <div key={parent.geoname_id} className="space-y-1.5">
        <Label className="text-xs">{nextLabel(depth,options)}</Label>
        <Select value={selected?String(selected.geoname_id):"__parent"} onValueChange={v=>chooseChild(depth,v)}>
          <SelectTrigger className={compact?"h-9":""}><SelectValue/></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__parent">Use {parent.name}</SelectItem>
            {options.map(p=><SelectItem key={p.geoname_id} value={String(p.geoname_id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>;
    })}

    {value?.display_path && (
      <div className={compact?"md:col-span-2 xl:col-span-3":"rounded-lg border bg-muted/30 px-3 py-2"}>
        <p className="text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{value.display_path}</span></p>
      </div>
    )}
  </div>;
}
