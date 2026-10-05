import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

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

function codeField(level:number) {
  return level === 1 ? "admin1_code" : level === 2 ? "admin2_code" : level === 3 ? "admin3_code" : "admin4_code";
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
  const config = COUNTRY_ADMIN[countryCode] ?? {level:1,label:"Region"};
  const [adminId,setAdminId]=useState<string>("");
  const [areaQuery,setAreaQuery]=useState("");

  const {data:adminAreas=[]}=useQuery({
    queryKey:["geo-admin-options",countryCode,config.level],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population")
        .eq("country_code",countryCode)
        .eq("feature_code",`ADM${config.level}`)
        .order("name")
        .limit(1000);
      if(error) throw error;
      return data??[];
    }
  });

  const {data:selectedPlace}=useQuery({
    queryKey:["geo-cascade-selected",value],
    enabled:!!value,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population")
        .eq("geoname_id",value).maybeSingle();
      if(error) throw error;
      return data as GeoPlace|null;
    }
  });

  useEffect(()=>{
    if(!selectedPlace || adminId) return;
    const field=codeField(config.level) as keyof GeoPlace;
    const selectedCode=selectedPlace[field];
    const direct=(adminAreas as GeoPlace[]).find(a=>a.geoname_id===selectedPlace.geoname_id);
    const byCode=(adminAreas as GeoPlace[]).find(a=>a[field]===selectedCode);
    const match=direct??byCode;
    if(match) setAdminId(String(match.geoname_id));
  },[selectedPlace,adminAreas,adminId,config.level]);

  useEffect(()=>{
    setAdminId("");
    setAreaQuery("");
  },[countryCode]);

  const selectedAdmin = useMemo(
    ()=> (adminAreas as GeoPlace[]).find(a=>String(a.geoname_id)===adminId) ?? null,
    [adminAreas,adminId]
  );

  const adminCode = selectedAdmin ? selectedAdmin[codeField(config.level) as keyof GeoPlace] as string|null : null;

  const {data:areas=[],isFetching}=useQuery({
    queryKey:["geo-area-options",countryCode,config.level,adminCode,areaQuery],
    enabled:!!selectedAdmin && areaQuery.trim().length>=1,
    queryFn:async()=>{
      const field=codeField(config.level);
      let q=(supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,admin1_code,admin2_code,admin3_code,admin4_code,latitude,longitude,population")
        .eq("country_code",countryCode)
        .eq(field,adminCode)
        .neq("geoname_id",selectedAdmin!.geoname_id)
        .ilike("name",`%${areaQuery.trim()}%`)
        .order("population",{ascending:false})
        .limit(80);
      const {data,error}=await q;
      if(error) throw error;
      return data??[];
    }
  });

  const changeAdmin=(id:string)=>{
    setAdminId(id);
    setAreaQuery("");
    const admin=(adminAreas as GeoPlace[]).find(a=>String(a.geoname_id)===id)??null;
    onChange(admin);
  };

  return <div className="space-y-3">
    <div className="space-y-2">
      <Label>{config.label} {required?"*":""}</Label>
      <Select value={adminId} onValueChange={changeAdmin}>
        <SelectTrigger><SelectValue placeholder={`Select ${config.label.toLowerCase()}…`} /></SelectTrigger>
        <SelectContent className="max-h-72">
          {(adminAreas as GeoPlace[]).map((a)=><SelectItem key={a.geoname_id} value={String(a.geoname_id)}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    {selectedAdmin && <div className="space-y-2">
      <Label>Area / sub-area</Label>
      {selectedPlace && selectedPlace.geoname_id!==selectedAdmin.geoname_id ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{selectedPlace.name}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedPlace.display_path}</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={()=>onChange(selectedAdmin)}><X className="h-4 w-4"/></Button>
        </div>
      ) : (
        <div className="relative">
          <Input value={areaQuery} onChange={e=>setAreaQuery(e.target.value)} placeholder={`Search only inside ${selectedAdmin.name}…`} />
          {areaQuery.trim().length>=1 && <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
            {isFetching && <p className="p-3 text-xs text-muted-foreground">Searching {selectedAdmin.name}…</p>}
            {!isFetching && (areas as GeoPlace[]).length===0 && <p className="p-3 text-xs text-muted-foreground">No matching area found inside {selectedAdmin.name}.</p>}
            {(areas as GeoPlace[]).map((p)=><button key={p.geoname_id} type="button" onClick={()=>{onChange(p);setAreaQuery("");}} className="block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-muted">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.display_path}</p>
            </button>)}
          </div>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">The area search is restricted to {selectedAdmin.name}; it will not return places from elsewhere in {countryCode}.</p>
    </div>}
  </div>;
}
