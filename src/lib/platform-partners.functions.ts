import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import sharp from "sharp";
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
export const savePartner=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(v=>saveInput.parse(v)).handler(async({context,data})=>{
 await admin(context.userId);
 let logo:string|undefined;
 if(data.logo_data_url){
  const match=/^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data.logo_data_url);
  if(!match)throw new Error("Upload a PNG, JPEG or WebP logo");
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length>180000)throw new Error("Logo file exceeds 180 KB. Please compress it.");
  try{
   const decoded=sharp(bytes,{limitInputPixels:4000000});
   const info=await decoded.metadata();
   if(!info.width||!info.height||info.width>2000||info.height>2000||!(["png","jpeg","webp"] as string[]).includes(info.format))throw Error("Invalid logo dimensions or format");
   logo="data:image/webp;base64,"+(await decoded.resize(440,180,{fit:"inside",withoutEnlargement:true}).webp({quality:86}).toBuffer()).toString("base64");
  }catch{throw new Error("The uploaded image could not be verified");}
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
