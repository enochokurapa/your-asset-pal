import {createFileRoute,useNavigate} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getPlatformBusinessDashboard,listPlatformBusinessRecords,updatePlatformBusinessRecord,closePlatformBusinessDashboard} from "@/lib/platform-business-dashboard.functions";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {LayoutDashboard,Package,MapPin,Tags,ShieldCheck,ArrowLeft,Users,RefreshCw} from "lucide-react";
import {toast} from "sonner";

type Kind="assets"|"categories"|"locations";
const fields:Record<Kind,string[]>={
 assets:["name","description","asset_tag","serial_number","status","purchase_value","purchase_date","category_id","location_id"],
 categories:["name","description"],locations:["name","address"],
};
export const Route=createFileRoute("/_app/saas-admin/business-dashboard")({
 validateSearch:(search:Record<string,unknown>)=>({session:typeof search.session==="string"?search.session:""}),
 component:PlatformBusinessDashboard
});
function PlatformBusinessDashboard(){
 const nav=useNavigate();
 const {session}=Route.useSearch();
 const [tab,setTab]=useState<"dashboard"|Kind>("dashboard");
 const [search,setSearch]=useState("");
 const [recordId,setRecordId]=useState("");
 const [field,setField]=useState("name");
 const [value,setValue]=useState("");
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);
 const client=useQueryClient();
 const get=useServerFn(getPlatformBusinessDashboard);
 const list=useServerFn(listPlatformBusinessRecords);
 const edit=useServerFn(updatePlatformBusinessRecord);
 const close=useServerFn(closePlatformBusinessDashboard);
 const call=async(fn:any,data:any)=>fn({headers:await getServerAuthHeaders(),data});
 const dashboard=useQuery({queryKey:["platform-direct-business",session],queryFn:()=>call(get,{sessionId:session}),
   enabled:!!session,refetchInterval:30000,retry:false});
 const kind:Kind=tab==="dashboard"?"assets":tab;
 const records=useQuery({queryKey:["platform-direct-records",session,kind,search],queryFn:()=>call(list,{sessionId:session,kind,search}),
   enabled:!!session&&tab!=="dashboard",retry:false});
 useEffect(()=>{setRecordId("");setSearch("");setField(fields[kind][0]);setValue("");},[tab]);
 const selected=(records.data??[]).find((r:any)=>r.id===recordId);
 useEffect(()=>{setValue(selected?.[field]==null?"":String(selected[field]));},[selected,field]);
 const business=dashboard.data?.business;
 const metrics=dashboard.data?.metrics;
 const expired=dashboard.data?.expiresAt&&Date.parse(dashboard.data.expiresAt)<=Date.now();
 async function stop(){setBusy(true);try{await call(close,{sessionId:session});toast.success("Support session closed");nav({to:"/saas-admin/organizations"});}catch(e:any){toast.error(e?.message||"Session already expired")}finally{setBusy(false);}}
 async function save(){setBusy(true);try{
   await call(edit,{sessionId:session,kind,recordId,field,value:value.trim()===""&&field!=="name"?null:value,reason});
   toast.success("Change saved and recorded in audit history");setReason("");
   await Promise.all([client.invalidateQueries({queryKey:["platform-direct-records"]}),client.invalidateQueries({queryKey:["platform-direct-business"]})]);
 }catch(e:any){toast.error(e?.message||"Unable to save")}finally{setBusy(false);}}
 return <div className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
   <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><div>
     <p className="font-bold">SaaS Admin · Business Dashboard Access</p>
     <p className="text-xs text-muted-foreground">{business?.name||"Loading business…"} · All changes are logged under your platform administrator account.</p>
   </div></div>
   <div className="flex items-center gap-2"><Badge variant="outline">{expired?"Expired":dashboard.data?.expiresAt?"Until "+new Date(dashboard.data.expiresAt).toLocaleTimeString():"Checking…"}</Badge>
   <Button variant="outline" disabled={busy} onClick={stop}><ArrowLeft className="mr-1 h-4 w-4"/>Exit business</Button></div>
  </div>
  {dashboard.error&&<Card className="p-5 text-destructive" role="alert">Business access denied or expired. Return to Businesses and select Access Dashboard again.</Card>}
  {!session&&<Card className="p-5 text-destructive">No valid dashboard session. Select a business from Businesses.</Card>}
  <div className="flex flex-wrap gap-2">
   {([{key:"dashboard",label:"Dashboard",icon:LayoutDashboard},{key:"assets",label:"Assets",icon:Package},{key:"categories",label:"Categories",icon:Tags},{key:"locations",label:"Locations",icon:MapPin}] as const).map(item=><Button key={item.key} variant={tab===item.key?"default":"outline"} onClick={()=>setTab(item.key)}><item.icon className="mr-2 h-4 w-4"/>{item.label}</Button>)}
  </div>
  {tab==="dashboard"?<>
   <div className="flex flex-wrap items-center justify-between"><div>
    <h1 className="text-2xl font-bold">{business?.name||"Business"} Dashboard</h1>
    <p className="text-sm text-muted-foreground">Live business records · {business?.status||"—"} plan</p>
   </div><Button variant="outline" onClick={()=>dashboard.refetch()}><RefreshCw className="mr-1 h-4 w-4"/>Refresh</Button></div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     {([{label:"Total assets",value:metrics?.assets,icon:Package},
        {label:"In use",value:metrics?.in_use,icon:LayoutDashboard},
        {label:"Registered users",value:metrics?.users,icon:Users},
        {label:"Locations",value:metrics?.locations,icon:MapPin},
        {label:"In storage",value:metrics?.stored,icon:Package},
        {label:"Under repair",value:metrics?.repair,icon:Package},
        {label:"Retired",value:metrics?.retired,icon:Package},
        {label:"Categories",value:metrics?.categories,icon:Tags}] as const).map(item=><Card key={item.label} className="p-5">
         <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{item.label}</p><item.icon className="h-5 w-5 text-primary"/></div>
         <p className="mt-2 text-3xl font-bold tabular-nums">{item.value??"—"}</p>
       </Card>)}
   </div>
   <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Recently registered assets</h2>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Asset</th><th className="p-2">Tag</th><th className="p-2">Status</th></tr></thead><tbody>
     {(dashboard.data?.recent??[]).map((x:any)=><tr key={x.id} className="border-b"><td className="p-2">{x.name}</td><td className="p-2">{x.asset_tag||"—"}</td><td className="p-2">{x.status}</td></tr>)}
    </tbody></table></div>
   </Card>
  </>:<Card className="space-y-4 p-5">
    <div><h2 className="text-xl font-semibold capitalize">{tab}</h2><p className="text-sm text-muted-foreground">Tenant-scoped records · select one to make a documented correction.</p></div>
    <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find record by name"/>
    {records.error&&<p className="text-destructive">Unable to load business records. Check your session.</p>}
    <div className="space-y-1"><Label>Record</Label><select className="w-full rounded-md border bg-background p-2" value={recordId} onChange={e=>setRecordId(e.target.value)}>
     <option value="">Choose record</option>{(records.data??[]).map((r:any)=><option key={r.id} value={r.id}>{r.name} {r.asset_tag?"· "+r.asset_tag:""}</option>)}
    </select></div>
    {selected&&<>
     <div className="space-y-1"><Label>Field</Label><select className="w-full rounded-md border bg-background p-2" value={field} onChange={e=>setField(e.target.value)}>
     {fields[kind].map(f=><option key={f} value={f}>{f.replaceAll("_"," ")}</option>)}</select></div>
     <div className="space-y-1"><Label>New value</Label>{field==="status"?<select className="w-full rounded-md border bg-background p-2" value={value} onChange={e=>setValue(e.target.value)}>
       {["in_use","in_storage","under_repair","retired","missing","disposed","checked_out"].map(s=><option key={s} value={s}>{s}</option>)}
       </select>:<Input value={value} maxLength={2000} onChange={e=>setValue(e.target.value)}/>}</div>
     <div className="space-y-1"><Label>Reason for change (recorded in audit)</Label><Input maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why platform intervention is required"/></div>
     <Button disabled={busy||expired||reason.trim().length<15} onClick={save}>Save and audit change</Button>
    </>}
   </Card>}
 </div>;
}
