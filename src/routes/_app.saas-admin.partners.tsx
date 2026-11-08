import {createFileRoute} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {getAdminPartners,savePartner,deletePartner} from "@/lib/platform-partners.functions";
import {toast} from "sonner";

export const Route=createFileRoute("/_app/saas-admin/partners")({component:PartnersAdmin});
function PartnersAdmin(){
 const client=useQueryClient();const fetchPartners=useServerFn(getAdminPartners);const save=useServerFn(savePartner);const remove=useServerFn(deletePartner);
 const {data=[],isLoading}=useQuery({queryKey:["admin-partners"],queryFn:()=>fetchPartners()});
 const [draft,setDraft]=useState({id:"",name:"",logo_data_url:"",is_active:true,sort_order:0});const [busy,setBusy]=useState(false);
 const reset=()=>setDraft({id:"",name:"",logo_data_url:"",is_active:true,sort_order:data.length*10});
 const upload=async(file?:File)=>{
  if(!file)return;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)){
   toast.error("Choose a PNG, JPEG or WebP logo");return;
  }
  if(file.size>12*1024*1024){toast.error("Choose an image under 12 MB");return;}
  setBusy(true);
  const objectUrl=URL.createObjectURL(file);
  try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Unable to open image"));img.src=objectUrl;
   });
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>25_000_000){
    throw new Error("Image is too large to process. Use a logo under 25 megapixels.");
   }
   const limitWidth=1200,limitHeight=560;
   const ratio=Math.min(1,limitWidth/image.naturalWidth,limitHeight/image.naturalHeight);
   const baseW=Math.max(1,Math.round(image.naturalWidth*ratio));
   const baseH=Math.max(1,Math.round(image.naturalHeight*ratio));
   let output:Blob|null=null;
   for(const scale of [1,.85,.7,.55,.4]){
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(baseW*scale));canvas.height=Math.max(1,Math.round(baseH*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Image processing unavailable");
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.92,.82,.7,.58]){
     const encoded=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",quality));
     if(encoded?.type==="image/webp"&&encoded.size<=170_000){output=encoded;break;}
    }
    if(output)break;
   }
   if(!output)throw new Error("This logo could not be optimized. Please use a simpler image.");
   const prepared=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read optimized image"));reader.readAsDataURL(output);
   });
   setDraft(previous=>({...previous,logo_data_url:prepared}));
   toast.success("Logo automatically fitted and optimized");
  }catch(error){toast.error(error instanceof Error?error.message:"Could not prepare logo");}
  finally{URL.revokeObjectURL(objectUrl);setBusy(false);}
 };
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:["admin-partners"]}),client.invalidateQueries({queryKey:["public-partner-logos"]})]);};
 const persist=async()=>{setBusy(true);try{await save({data:{...draft,id:draft.id||undefined,logo_data_url:draft.logo_data_url||undefined}});await refresh();reset();toast.success("Partner logo saved");}catch(e:any){toast.error(e?.message||"Could not save partner");}finally{setBusy(false)}};
 const del=async(id:string)=>{setBusy(true);try{await remove({data:{id}});await refresh();if(draft.id===id)reset();toast.success("Partner removed");}catch(e:any){toast.error(e?.message||"Could not delete partner");}finally{setBusy(false)}};
 return <div className="mx-auto max-w-4xl space-y-5"><div><h1 className="text-xl font-bold sm:text-2xl">Homepage partners</h1><p className="mt-1 text-sm text-muted-foreground">Upload logos only. No links are displayed.</p></div>
 <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"><h2 className="font-semibold">{draft.id?"Edit partner":"Add partner"}</h2><div className="space-y-1"><Label htmlFor="partner-name">Partner name</Label><Input id="partner-name" maxLength={80} value={draft.name} onChange={e=>setDraft(s=>({...s,name:e.target.value}))}/></div><div className="space-y-1"><Label htmlFor="partner-image">Logo (PNG, WebP, JPEG)</Label><Input id="partner-image" type="file" accept="image/png,image/webp,image/jpeg" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/><p className="text-xs text-muted-foreground">Automatically fits and optimizes your logo. No manual resizing needed.</p></div>{draft.logo_data_url&&<img src={draft.logo_data_url} alt="Partner logo preview" className="h-20 w-full rounded-lg border bg-white object-contain p-2"/>}<div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft(s=>({...s,is_active:e.target.checked}))}/>Visible</label><Label htmlFor="partner-order">Order</Label><Input id="partner-order" className="w-20" type="number" min={0} max={9999} value={draft.sort_order} onChange={e=>setDraft(s=>({...s,sort_order:Number(e.target.value)||0}))}/></div><div className="flex gap-2"><Button disabled={busy||!draft.name.trim()||(!draft.id&&!draft.logo_data_url)} onClick={persist}>{busy?"Saving…":"Save partner"}</Button><Button variant="outline" onClick={reset}>Clear</Button></div></section>
 <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"><h2 className="font-semibold">Partner logos ({data.length})</h2>{isLoading&&<p className="text-sm">Loading…</p>}{!isLoading&&!data.length&&<p className="text-sm text-muted-foreground">No partner logos uploaded yet. The homepage section appears when a logo is published.</p>}{data.map(item=><div key={item.id} className="flex items-center gap-3 rounded-lg border p-2"><img src={item.logo_data_url} alt={item.name+" logo"} className="h-14 w-20 shrink-0 object-contain"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.is_active?"Visible":"Hidden"} · Order {item.sort_order}</p></div><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>setDraft({...item})}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>del(item.id)}>Remove</Button></div></div>)}</section></div></div>;
}
