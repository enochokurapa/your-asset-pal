import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {queryPostgres} from "@/lib/postgres.server";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

type Partner={id:string;name:string;logo_data_url:string;is_active:boolean;sort_order:number};
const uuid=z.string().uuid();
const saveInput=z.object({id:uuid.optional(),name:z.string().trim().min(2).max(80),logo_data_url:z.string().max(250000).optional(),is_active:z.boolean(),sort_order:z.number().int().min(0).max(9999)});
async function admin(userId:string){
 const rows=await queryPostgres<{id:string}>("SELECT id FROM public.profiles WHERE id=$1 AND is_saas_admin=true AND is_active=true",[userId]);
 if(!rows.length)throw new Error("SaaS administrator required");
}
export const getPublicPartners=createServerFn({method:"GET"}).handler(async()=>{
 return queryPostgres<Pick<Partner,"id"|"name"|"logo_data_url">>(`SELECT id,name,logo_data_url FROM public.platform_partner_logos WHERE is_active=true ORDER BY sort_order ASC,created_at ASC LIMIT 24`);
});
export const getAdminPartners=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 await admin(context.userId);
 return queryPostgres<Partner>(`SELECT id,name,logo_data_url,is_active,sort_order FROM public.platform_partner_logos ORDER BY sort_order ASC,created_at ASC LIMIT 24`);
});
/** Validate uploaded image bytes without relying on a native image encoder in the
 * lean production container. Accept real PNG, JPEG and WebP signatures only. */
function imageDimensions(bytes:Buffer,mime:"png"|"jpeg"|"webp"):{width:number;height:number}{
 if(mime==="png"){
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString("ascii",12,16)!=="IHDR")throw Error("Invalid PNG image");
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 }
 if(mime==="webp"){
  if(bytes.length<30||bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP")throw Error("Invalid WebP image");
  const kind=bytes.toString("ascii",12,16);
  if(kind==="VP8X")return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
  if(kind==="VP8L"){
   if(bytes.length<25||bytes[20]!==0x2f)throw Error("Invalid WebP lossless image");
   const packed=bytes.readUInt32LE(21);
   return {width:(packed&0x3fff)+1,height:((packed>>>14)&0x3fff)+1};
  }
  if(kind==="VP8 "){
   if(bytes.length<30||bytes[23]!==0x9d||bytes[24]!==0x01||bytes[25]!==0x2a)throw Error("Invalid WebP image header");
   return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
  }
  throw Error("Unsupported WebP format");
 }
 if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error("Invalid JPEG image");
 let offset=2;
 while(offset+4<bytes.length){
  if(bytes[offset]!==0xff){offset++;continue;}
  const marker=bytes[offset+1];offset+=2;
  if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(offset+2>bytes.length)break;
  const size=bytes.readUInt16BE(offset);
  if(size<2||offset+size>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(size<7)throw Error("Invalid JPEG dimensions");
   return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};
  }
  offset+=size;
 }
 throw Error("Unable to read JPEG dimensions");
}
export const savePartner=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(v=>saveInput.parse(v)).handler(async({context,data})=>{
 await admin(context.userId);
 let logo:string|undefined;
 if(data.logo_data_url){
  const match=/^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data.logo_data_url);
  if(!match)throw new Error("Upload a PNG, JPEG or WebP logo");
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length>180000)throw new Error("Logo file exceeds 180 KB. Please compress it.");
  const mime=match[1] as "png"|"jpeg"|"webp";
  const dimensions=imageDimensions(bytes,mime);
  if(!dimensions.width||!dimensions.height||dimensions.width>2000||dimensions.height>2000||dimensions.width*dimensions.height>4000000){
   throw new Error("Logo must be no larger than 2000 × 2000 pixels.");
  }
  // Store original validated bytes: the final app image intentionally does not
  // include native image encoders. The browser can render PNG/JPEG/WebP directly.
  logo=`data:image/${mime};base64,${bytes.toString("base64")}`;
 }
 if(data.id){
  const updated=await queryPostgres<{id:string}>(`UPDATE public.platform_partner_logos SET name=$2,logo_data_url=COALESCE($3,logo_data_url),is_active=$4,sort_order=$5,updated_at=now() WHERE id=$1 RETURNING id`,[data.id,data.name,logo||null,data.is_active,data.sort_order]);
  if(!updated.length)throw new Error("Partner not found");
 }else{
  if(!logo)throw Error("Choose a partner logo");
  const rows=await queryPostgres<{total:string}>(`SELECT COUNT(*)::text AS total FROM public.platform_partner_logos`);
  if(Number(rows[0]?.total||0)>=24)throw Error("Maximum 24 partners");
  await queryPostgres(`INSERT INTO public.platform_partner_logos(name,logo_data_url,is_active,sort_order) VALUES($1,$2,$3,$4)`,[data.name,logo,data.is_active,data.sort_order]);
 }
 return {saved:true};
});
export const deletePartner=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:uuid}).parse(v)).handler(async({context,data})=>{
 await admin(context.userId);
 await queryPostgres(`DELETE FROM public.platform_partner_logos WHERE id=$1`,[data.id]);
 return {deleted:true};
});
