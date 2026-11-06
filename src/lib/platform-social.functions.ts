import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {queryPostgres} from "@/lib/postgres.server";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

const platforms=["whatsapp","facebook","instagram","linkedin","x","youtube","tiktok","telegram"] as const;
export type SocialPlatform=typeof platforms[number];
export type SocialLink={platform:SocialPlatform;url:string;is_active:boolean;sort_order:number};
const allowedHosts:Record<Exclude<SocialPlatform,"whatsapp">,string[]>={
 facebook:["facebook.com","fb.com"],
 instagram:["instagram.com"],
 linkedin:["linkedin.com"],
 x:["x.com","twitter.com"],
 youtube:["youtube.com","youtu.be"],
 tiktok:["tiktok.com"],
 telegram:["t.me","telegram.me"],
};
function validatedDestination(platform:SocialPlatform,value:string){
 if(platform==="whatsapp"){
   const digits=value.replace(/[\s()+-]/g,"");
   if(!/^\d{9,15}$/.test(digits)||digits.startsWith("0"))
     throw Error("Use a complete international WhatsApp number, for example 256772123456 (digits only, no leading 0).");
   return "https://wa.me/"+digits;
 }
 let u:URL;
 try{u=new URL(value.trim());}catch{throw Error("Enter a valid HTTPS social profile URL");}
 if(u.protocol!=="https:"||u.username||u.password)
   throw Error("Social links must use HTTPS without embedded credentials");
 const hosts=allowedHosts[platform];
 if(!hosts.some(host=>u.hostname.toLowerCase()===host||u.hostname.toLowerCase().endsWith("."+host)))
   throw Error("The address does not match the selected social platform");
 return u.toString();
}
const input=z.object({
 platform:z.enum(platforms),
 url:z.string().trim().max(500),
 is_active:z.boolean(),
 sort_order:z.number().int().min(0).max(100),
});
async function checkAdmin(userId:string){
 const [admin]=await queryPostgres<{id:string}>(
  "SELECT id FROM public.profiles WHERE id=$1 AND is_saas_admin=TRUE AND is_active=TRUE LIMIT 1",[userId]);
 if(!admin)throw Error("SaaS administrator required");
}
export const getPublicSocialLinks=createServerFn({method:"GET"}).handler(async()=>{
 return queryPostgres<SocialLink>(`SELECT platform,url,is_active,sort_order
   FROM public.platform_social_links
   WHERE is_active=TRUE AND url<>'' ORDER BY sort_order,platform LIMIT 8`);
});
export const getAdminSocialLinks=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  await checkAdmin(context.userId);
  return queryPostgres<SocialLink>(`SELECT platform,url,is_active,sort_order
    FROM public.platform_social_links ORDER BY sort_order,platform`);
 });
export const updateAdminSocialLink=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(inputValue=>input.parse(inputValue))
 .handler(async({context,data})=>{
  await checkAdmin(context.userId);
  const url=data.url ? validatedDestination(data.platform,data.url) : "";
  if(data.is_active&&!url)throw Error("Add a destination before enabling this platform");
  await queryPostgres(`INSERT INTO public.platform_social_links(platform,url,is_active,sort_order,updated_at)
    VALUES($1,$2,$3,$4,NOW())
    ON CONFLICT(platform) DO UPDATE SET
      url=EXCLUDED.url,is_active=EXCLUDED.is_active,
      sort_order=EXCLUDED.sort_order,updated_at=NOW()`,
    [data.platform,url,data.is_active,data.sort_order]);
  return {saved:true};
 });
