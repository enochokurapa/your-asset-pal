import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryPostgres } from "@/lib/postgres.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Key = string;
type StatSource = "live"|"manual"|"hybrid";
const predefined=new Set(["assets","companies","locations","verifications","site_visits","app_visits"]);
export type PublicStat = {
  metric_key: Key; label: string; source: StatSource;
  manual_value: number; live_anchor:number; anchor_recorded_at:string|null; is_visible: boolean; sort_order: number; value: number;
};
const rowSql = `SELECT metric_key,label,source,manual_value::int,live_anchor::int,anchor_recorded_at,is_visible,sort_order
  FROM public.platform_public_stats ORDER BY sort_order,metric_key`;
async function readStats(): Promise<PublicStat[]> {
  const [counts] = await queryPostgres<{
    assets: string; companies: string; locations: string; verifications: string; site_visits:string; app_visits:string;
  }>(`SELECT
    (SELECT COUNT(*)::text FROM public.assets) AS assets,
    (SELECT COUNT(*)::text FROM public.tenants) AS companies,
    (SELECT COUNT(*)::text FROM public.locations WHERE is_active=TRUE) AS locations,
    (SELECT COUNT(*)::text FROM public.asset_verifications WHERE status='verified') AS verifications,
    (SELECT COALESCE(SUM(views),0)::text FROM public.platform_page_view_daily WHERE area='website') AS site_visits,
    (SELECT COALESCE(SUM(views),0)::text FROM public.platform_page_view_daily WHERE area='application') AS app_visits`);
  const rows = await queryPostgres<Omit<PublicStat,"value">>(rowSql);
  return rows.map(row => {
    const live = Number(counts[row.metric_key as keyof typeof counts] || 0);
    const value = row.source==="manual" ? Number(row.manual_value)
      : row.source==="hybrid" ? Number(row.manual_value) + Math.max(0,live-Number(row.live_anchor||0))
      : live;
    return {...row,value,live_value:live};
  });
}
async function requirePlatformAdmin(userId: string) {
  const [admin] = await queryPostgres<{id:string}>(
    "SELECT id FROM public.profiles WHERE id=$1 AND is_saas_admin=TRUE AND is_active=TRUE LIMIT 1",
    [userId],
  );
  if (!admin) throw new Error("Platform administrator required");
}
export type PublicHomepageStat={metric_key:string;label:string;value:number};
/** One small query for the homepage: no unrelated traffic totals or admin records.
 *  The route loader renders these figures directly into initial HTML. */
export const getPublicStats=createServerFn({method:"GET"}).handler(async():Promise<PublicHomepageStat[]>=>{
  const rows=await queryPostgres<{
    metric_key:string;label:string;source:StatSource;manual_value:string;
    live_anchor:string;live_value:string;
  }>(`
    SELECT s.metric_key,s.label,s.source,s.manual_value::text,s.live_anchor::text,
      CASE s.metric_key
        WHEN 'assets' THEN counts.assets
        WHEN 'companies' THEN counts.companies
        WHEN 'locations' THEN counts.locations
        WHEN 'verifications' THEN counts.verifications
        ELSE '0'
      END AS live_value
    FROM public.platform_public_stats s
    CROSS JOIN (
      SELECT
        (SELECT COUNT(*)::text FROM public.assets) AS assets,
        (SELECT COUNT(*)::text FROM public.tenants) AS companies,
        (SELECT COUNT(*)::text FROM public.locations WHERE is_active=TRUE) AS locations,
        (SELECT COUNT(*)::text FROM public.asset_verifications WHERE status='verified') AS verifications
    ) counts
    WHERE s.is_visible=TRUE AND s.metric_key NOT IN ('site_visits','app_visits')
    ORDER BY s.sort_order,s.metric_key LIMIT 12
  `);
  return rows.map(r=>{
    const live=Number(r.live_value||0),manual=Number(r.manual_value||0);
    const value=r.source==="manual"?manual:r.source==="hybrid"
      ?manual+Math.max(0,live-Number(r.live_anchor||0)):live;
    return {metric_key:r.metric_key,label:r.label,value};
  });
});
export const getAdminPublicStats = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    await requirePlatformAdmin(context.userId);
    return readStats();
  });
export const updatePublicStat = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({
    metric_key:z.string().regex(/^[a-z][a-z0-9_]{2,30}$/),
    label:z.string().trim().min(3).max(55),
    source:z.enum(["live","manual","hybrid"]),
    manual_value:z.number().int().min(0).max(1_000_000_000),
    is_visible:z.boolean(),
  }).parse(input))
  .handler(async ({context,data}) => {
    await requirePlatformAdmin(context.userId);
    if(!predefined.has(data.metric_key) && data.source!=="manual")
      throw new Error("Only built-in statistics can use live or hybrid database values");
    const [row]=await queryPostgres<{exists:boolean;count:string}>(`
      SELECT EXISTS(SELECT 1 FROM public.platform_public_stats WHERE metric_key=$1) AS exists,
             COUNT(*)::text AS count FROM public.platform_public_stats
    `,[data.metric_key]);
    if(!row.exists && Number(row.count)>=12)
      throw new Error("A maximum of 12 homepage statistics is supported");
    const previous=await queryPostgres<{source:StatSource}>(`
      SELECT source FROM public.platform_public_stats WHERE metric_key=$1`,[data.metric_key]);
    // Capture the live total only on entering Hybrid. Editing the foundation thereafter
    // must not reset the starting point or double-count earlier records.
    const enteringHybrid=data.source==="hybrid" && previous[0]?.source!=="hybrid";
    let anchor=0;
    if(enteringHybrid){
      const current=(await readStats()).find(row=>row.metric_key===data.metric_key) as
        (PublicStat & {live_value:number})|undefined;
      anchor=current?.live_value??0;
    }
    await queryPostgres(`
      INSERT INTO public.platform_public_stats(
        metric_key,label,source,manual_value,is_visible,sort_order,live_anchor,anchor_recorded_at)
      VALUES($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(sort_order),0)+10 FROM public.platform_public_stats),
             $6,CASE WHEN $3='hybrid' THEN NOW() ELSE NULL END)
      ON CONFLICT(metric_key) DO UPDATE SET
        label=EXCLUDED.label,source=EXCLUDED.source,
        manual_value=EXCLUDED.manual_value,is_visible=EXCLUDED.is_visible,
        live_anchor=CASE WHEN $7 THEN $6 ELSE public.platform_public_stats.live_anchor END,
        anchor_recorded_at=CASE WHEN $7 THEN NOW() ELSE public.platform_public_stats.anchor_recorded_at END
    `,[data.metric_key,data.label,data.source,data.manual_value,data.is_visible,anchor,enteringHybrid]);
    return {saved:true};
  });

export const deletePublicStat = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({
    metric_key:z.string().regex(/^[a-z][a-z0-9_]{2,30}$/),
  }).parse(input))
  .handler(async ({context,data})=>{
    await requirePlatformAdmin(context.userId);
    if(predefined.has(data.metric_key))throw new Error("Built-in statistics cannot be deleted; hide them instead.");
    await queryPostgres("DELETE FROM public.platform_public_stats WHERE metric_key=$1",[data.metric_key]);
    return {deleted:true};
  });
