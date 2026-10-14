import {useEffect,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {getAssetTagSettings,saveAssetTagSettings} from "@/lib/builders.functions";
import {useAuth} from "@/hooks/use-auth";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {toast} from "sonner";
export function AssetNumberingSettings(){
 const {isTenantAdmin}=useAuth();
 const read=useServerFn(getAssetTagSettings),write=useServerFn(saveAssetTagSettings);
 const [prefix,setPrefix]=useState("AST"),[separator,setSeparator]=useState("-"),[digits,setDigits]=useState(5),[next,setNext]=useState(1),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!isTenantAdmin)return;getServerAuthHeaders().then(headers=>read({headers})).then(s=>{setPrefix(s.prefix);setSeparator(s.separator);setDigits(s.padding);setNext(s.next_number)}).catch(e=>toast.error(e.message||"Number settings unavailable"))},[isTenantAdmin]);
 const save=async()=>{setBusy(true);try{await write({headers:await getServerAuthHeaders(),data:{prefix,separator:separator as ""|"-"|"/",padding:digits}});toast.success("Company asset tag format saved for new records");}catch(e:any){toast.error(e?.message||"Could not save tag settings")}finally{setBusy(false)}};
 return <Card className="space-y-5 p-5"><div><h2 className="text-lg font-bold">Company asset tag initials</h2><p className="text-sm text-muted-foreground">Set the exact letters and numbering format for new assets and numeric tag values imported from Excel. Existing asset tags are not automatically changed.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Company initials</Label><Input disabled={!isTenantAdmin} maxLength={10} value={prefix} onChange={e=>setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="IUCEA"/></div><div className="space-y-2"><Label>Separator</Label><Select disabled={!isTenantAdmin} value={separator||"none"} onValueChange={v=>setSeparator(v==="none"?"":v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No separator</SelectItem><SelectItem value="-">Dash (-)</SelectItem><SelectItem value="/">Slash (/)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Digits</Label><Select disabled={!isTenantAdmin} value={String(digits)} onValueChange={v=>setDigits(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:11},(_,i)=>i+2).map(n=><SelectItem key={n} value={String(n)}>{n} digits</SelectItem>)}</SelectContent></Select></div></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-4"><div><p className="text-sm font-medium">Next automatically generated tag example</p><p className="mt-1 font-mono text-xl font-bold">{prefix}{separator}{String(next).padStart(digits,"0")}</p></div><Button disabled={!isTenantAdmin||busy||!prefix} onClick={save}>{busy?"Saving...":"Save tag format"}</Button></div><p className="text-xs text-muted-foreground">Changing this format does not rename previously imported tags. Historic tag correction needs a separate, reviewed migration to protect asset references.</p></Card>;
}
