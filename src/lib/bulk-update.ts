import * as XLSX from "xlsx";
import {supabase} from "@/integrations/supabase/client";

type CustomField={key:string;label:string;type?:string;options?:string[]};
type Register={id:string;configuration?:{fields?:CustomField[]}};
export type UpdateResult={total:number;updated:number;unchanged:number;failed:Array<{row:number;id:string;message:string}>};
const norm=(s:string)=>s.trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const CLEAR="__CLEAR__";
const system:Record<string,string>={
 "assetname":"name","systemassetname":"name","systemserialnumber":"serial_number",
 "systemdescription":"description","purchasevalue":"purchase_value",
 "purchasedate":"purchase_date","systemstatus":"status"
};
const lifecycle=new Set(["in_use","in_storage","under_repair","retired","missing","disposed"]);
export async function bulkUpdateFromFile(file:File,register:Register,
 onProgress?:(completed:number,total:number,updated:number,failed:number)=>void,
 previewOnly=false):Promise<UpdateResult>{
 if(!register?.id)throw Error("Select a saved custom register for bulk update.");
 if(file.size<1||file.size>20*1024*1024)throw Error("Excel must be smaller than 20 MB");
 const book=XLSX.read(await file.arrayBuffer(),{type:"array",sheetRows:10002,cellFormula:false,cellHTML:false});
 const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(book.Sheets[book.SheetNames[0]],{defval:""});
 if(!rows.length||rows.length>10000)throw Error("Use an Excel file with 1 to 10,000 records.");
 const fields=register.configuration?.fields??[];
 const customByHeader=new Map(fields.flatMap(f=>[[norm(f.label),f],[norm(f.key),f]] as Array<[string,CustomField]>));
 const headings=Object.keys(rows[0]);
 const idCol=headings.find(k=>norm(k)==="assetid");
 if(!idCol)throw Error('An "Asset ID" column is required. Export the register first.');
 const permitted=new Set([...Object.keys(system),...customByHeader.keys(),"assetid","systemassettag"]);
 const unmapped=headings.filter(k=>!permitted.has(norm(k))&&!["assettag","tagnumber"].includes(norm(k)));
 if(unmapped.length)throw Error("Unknown update columns: "+unmapped.join(", ")+". Add fields in Register Builder before updating.");
 const existingById=new Map<string,any>();
 const candidates=[...new Set(rows.map(r=>String(r[idCol]??"").trim()).filter(isUuid))];
 for(let start=0;start<candidates.length;start+=200){
  const ids=candidates.slice(start,start+200);
  const {data,error}=await supabase.from("assets")
    .select("id,name,serial_number,description,purchase_value,purchase_date,status,custom_fields,register_definition_id")
    .eq("register_definition_id",register.id).in("id",ids);
  if(error)throw Error("Could not load existing assets for update: "+error.message);
  for(const asset of data??[])existingById.set(asset.id,asset);
 }
 const seen=new Set<string>();
 const result:UpdateResult={total:rows.length,updated:0,unchanged:0,failed:[]};
 for(let index=0;index<rows.length;index++){
  const row=rows[index], id=String(row[idCol]??"").trim();
  try{
   if(!isUuid(id))throw Error("Missing or invalid permanent Asset ID");
   if(seen.has(id))throw Error("Duplicate Asset ID in upload");seen.add(id);
   const original=existingById.get(id);
   if(!original)throw Error("Asset not found in selected register or access denied");
   const patch:Record<string,unknown>={},custom={...((original.custom_fields??{}) as Record<string,unknown>)};
   let changed=false;
   for(const column of headings){
    if(column===idCol)continue;
    const raw=row[column];
    const text=String(raw??"").trim();
    if(!text)continue; // blank leaves existing value alone
    const val=text===CLEAR?null:raw;
    const field=customByHeader.get(norm(column));
    if(field){
     let next:unknown=val;
     if(val!==null&&["number","currency"].includes(field.type??"")){
       next=Number(val);if(!Number.isFinite(next))throw Error(column+" must be numeric");
     }
     if(val!==null&&field.type==="date"&&!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Error(column+" must be YYYY-MM-DD");
     if(val!==null&&["select","radio"].includes(field.type??"")&&field.options?.length&&!field.options.includes(text))
       throw Error(column+" is not one of the configured dropdown choices");
     if(val!==null&&field.type==="boolean"){
      if(!["yes","no","true","false","1","0"].includes(text.toLowerCase()))throw Error(column+" must be Yes/No");
      next=["yes","true","1"].includes(text.toLowerCase());
     }
     if(custom[field.key]!==next){custom[field.key]=next;changed=true;}
     continue;
    }
    const target=system[norm(column)];
    if(!target)continue;
    if(target==="status"&&val!==null&&!lifecycle.has(text.toLowerCase().replace(/\s+/g,"_")))throw Error("Invalid system lifecycle status");
    let next:unknown=val;
    if(target==="purchase_value"&&val!==null){next=Number(val);if(!Number.isFinite(next))throw Error("Invalid purchase value");}
    if(target==="purchase_date"&&val!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Error("Purchase date must be YYYY-MM-DD");
    if(target==="status"&&val!==null)next=text.toLowerCase().replace(/\s+/g,"_");
    if((original as any)[target]!==next){patch[target]=next;changed=true;}
   }
   if(Object.keys(custom).some(key=>custom[key]!==((original.custom_fields??{}) as Record<string,unknown>)[key]))patch.custom_fields=custom;
   if(!changed){result.unchanged++;continue;}
   if(!previewOnly){
    const {data:saved,error}=await supabase.from("assets").update(patch)
      .eq("id",id).eq("register_definition_id",register.id).select("id").maybeSingle();
    if(error||!saved)throw Error(error?.message||"The asset update was not confirmed by the server");
   }
   result.updated++;
  }catch(e){result.failed.push({row:index+2,id,message:e instanceof Error?e.message:String(e)});}
  finally{if(onProgress&&((index+1)%20===0||index+1===rows.length))onProgress(index+1,rows.length,result.updated,result.failed.length);}
 }
 return result;
}


export function downloadBulkUpdateTemplate(register:Register,assets:Array<{id:string;asset_tag?:string|null}>) {
 const fields=register.configuration?.fields??[];
 const columns=["Asset ID","System Asset Tag","System Asset Name","System Serial Number",
  "System Description","Purchase Date","Purchase Value","System Status",...fields.map(f=>f.label)];
 const records=assets.map(asset=>[asset.id,asset.asset_tag??"",...columns.slice(2).map(()=>"")]);
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([columns,...records]),"Update Existing");
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ["Rule","Explanation"],
  ["Asset ID","Required. Permanent ID from the exported register. Never change this value."],
  ["Blank cell","Leave existing value unchanged."],
  ["__CLEAR__","Explicitly clear the existing value in an editable field."],
  ["System Asset Tag","Reference only. This workflow does not change tags."],
  ["System Status","Use valid lifecycle values only; custom STATUS text can contain any words."],
  ["Preview","Always review the preview before confirming updates."],
 ]),"Instructions");
 XLSX.writeFile(workbook,"assetflow-bulk-update-template.xlsx");
}
