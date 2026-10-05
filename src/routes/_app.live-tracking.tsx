import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Radar, Radio, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/live-tracking")({ component: LiveTrackingPage });

function LiveTrackingPage() {
  const { canView, tenantId, isTenantAdmin } = useAuth();
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [provider,setProvider]=useState("generic");
  const [externalId,setExternalId]=useState("");
  const [label,setLabel]=useState("");
  const [assetId,setAssetId]=useState("");

  if(!canView("live_tracking")) return <Navigate to="/locations"/>;

  const {data:assets=[]}=useQuery({
    queryKey:["tracking-assets"],
    queryFn:async()=> (await supabase.from("assets").select("id,asset_tag,name").order("name")).data??[],
  });
  const {data:devices=[]}=useQuery({
    queryKey:["tracking-devices"],
    queryFn:async()=> (await (supabase as any).from("tracking_devices").select("*,assets(asset_tag,name)").order("created_at",{ascending:false})).data??[],
  });
  const {data:events=[]}=useQuery({
    queryKey:["tracking-events"],
    queryFn:async()=> (await (supabase as any).from("tracking_events").select("id,asset_id,device_id,latitude,longitude,accuracy_m,speed_kph,recorded_at").order("recorded_at",{ascending:false}).limit(100)).data??[],
  });

  const add=async()=>{
    if(!tenantId||!externalId.trim()) return;
    const {error}=await (supabase as any).from("tracking_devices").insert({
      tenant_id:tenantId,provider,external_device_id:externalId.trim(),label:label.trim()||null,
      asset_id:assetId||null,is_active:false,
    });
    if(error) return toast.error(error.message);
    setOpen(false);setExternalId("");setLabel("");setAssetId("");qc.invalidateQueries({queryKey:["tracking-devices"]});toast.success("Tracker registered");
  };

  const latestByDevice=new Map<string,any>();
  (events as any[]).forEach(e=>{if(!latestByDevice.has(e.device_id))latestByDevice.set(e.device_id,e);});

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">Live Tracking</h1><p className="text-sm text-muted-foreground">GPS/IoT tracking for assets that have a compatible tracker or telemetry source.</p></div>
      {isTenantAdmin&&<Button onClick={()=>setOpen(true)}><Plus className="mr-2 h-4 w-4"/>Register tracker</Button>}
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Metric label="Trackers" value={devices.length}/>
      <Metric label="Active" value={(devices as any[]).filter(d=>d.is_active).length}/>
      <Metric label="Telemetry events" value={events.length}/>
    </div>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Radar className="h-5 w-5 text-primary"/>Devices</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {(devices as any[]).length===0?<p className="text-sm text-muted-foreground">No tracking devices registered.</p>:
        (devices as any[]).map(d=>{
          const e=latestByDevice.get(d.id);
          return <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><div className="flex items-center gap-2"><p className="font-medium">{d.label||d.external_device_id}</p><Badge variant={d.is_active?"secondary":"outline"}>{d.is_active?"Active":"Disabled"}</Badge></div>
              <p className="text-xs text-muted-foreground">{d.provider} · {d.assets?`${d.assets.asset_tag} — ${d.assets.name}`:"Not linked to an asset"}</p>
              {e&&<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3"/>{Number(e.latitude).toFixed(6)}, {Number(e.longitude).toFixed(6)} · {new Date(e.recorded_at).toLocaleString()}</p>}
            </div>
            <Radio className={d.is_active?"h-5 w-5 text-primary":"h-5 w-5 text-muted-foreground"}/>
          </div>;
        })}
      </CardContent>
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Register tracking device</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2"><Label>Provider</Label><Select value={provider} onValueChange={setProvider}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="generic">Generic GPS / IoT</SelectItem><SelectItem value="traccar">Traccar</SelectItem><SelectItem value="teltonika">Teltonika</SelectItem><SelectItem value="queclink">Queclink</SelectItem><SelectItem value="samsara">Samsara</SelectItem>
        </SelectContent></Select></div>
        <div className="space-y-2"><Label>Device ID *</Label><Input value={externalId} onChange={e=>setExternalId(e.target.value)} placeholder="IMEI / provider device ID"/></div>
        <div className="space-y-2"><Label>Label</Label><Input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Vehicle tracker 01"/></div>
        <div className="space-y-2"><Label>Asset</Label><Select value={assetId||"none"} onValueChange={v=>setAssetId(v==="none"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="none">Not linked yet</SelectItem>{(assets as any[]).map(a=><SelectItem key={a.id} value={a.id}>{a.asset_tag} — {a.name}</SelectItem>)}
        </SelectContent></Select></div>
        <p className="text-xs text-muted-foreground">New trackers remain disabled until an administrator activates live tracking and configures the provider credentials.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={add}>Register</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function Metric({label,value}:{label:string;value:number|string}){return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></Card>;}
