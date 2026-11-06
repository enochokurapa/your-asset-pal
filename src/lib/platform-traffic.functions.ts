import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {queryPostgres} from "@/lib/postgres.server";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

const trafficInput=z.object({
  page:z.string().max(150),
  source:z.enum(["direct","search","social","referral","campaign","internal"]),
});
async function record(area:"website"|"application",data:z.infer<typeof trafficInput>){
  const page=data.page.split("?")[0].replace(/[^a-zA-Z0-9/_-]/g,"").slice(0,90)||"/";
  // Aggregate only. Never store IP, cookie, user agent, or identifiable visitor ID.
  await queryPostgres(`INSERT INTO public.platform_page_view_daily(day,area,source,page,views)
    VALUES(CURRENT_DATE,$1,$2,$3,1) ON CONFLICT(day,area,source,page)
    DO UPDATE SET views=LEAST(public.platform_page_view_daily.views+1,1000000000)`,
    [area,data.source,page]);
  return {ok:true};
}
export const recordPublicPageView=createServerFn({method:"POST"})
  .inputValidator(input=>trafficInput.parse(input))
  .handler(async({data})=>record("website",data));
export const recordApplicationPageView=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>trafficInput.parse(input))
  .handler(async({data})=>record("application",data));

async function requireAdmin(userId:string){
  const [row]=await queryPostgres<{id:string}>(
    "SELECT id FROM public.profiles WHERE id=$1 AND is_active=TRUE AND is_saas_admin=TRUE LIMIT 1",[userId]);
  if(!row)throw Error("SaaS administrator required");
}
export const getTrafficAnalytics=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    await requireAdmin(context.userId);
    const daily=await queryPostgres<{day:string;area:string;views:number}>(`
      SELECT day::text,area,SUM(views)::int views FROM public.platform_page_view_daily
      WHERE day>=CURRENT_DATE-INTERVAL '30 days'
      GROUP BY day,area ORDER BY day DESC,area LIMIT 90`);
    const sources=await queryPostgres<{source:string;area:string;views:number}>(`
      SELECT source,area,SUM(views)::int views FROM public.platform_page_view_daily
      WHERE day>=CURRENT_DATE-INTERVAL '30 days'
      GROUP BY source,area ORDER BY views DESC LIMIT 15`);
    const pages=await queryPostgres<{page:string;area:string;views:number}>(`
      SELECT page,area,SUM(views)::int views FROM public.platform_page_view_daily
      WHERE day>=CURRENT_DATE-INTERVAL '30 days'
      GROUP BY page,area ORDER BY views DESC LIMIT 20`);
    const [totals]=await queryPostgres<{website:string;application:string}>(`
      SELECT COALESCE(SUM(views) FILTER(WHERE area='website'),0)::text website,
             COALESCE(SUM(views) FILTER(WHERE area='application'),0)::text application
      FROM public.platform_page_view_daily`);
    return {daily,sources,pages,totals:{website:Number(totals.website),application:Number(totals.application)},
      note:"Counts reflect recorded page views, not verified unique visitors. Traffic tracking begins on deployment."};
  });
