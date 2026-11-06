import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryPostgres } from "@/lib/postgres.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Key = "assets" | "companies" | "locations" | "verifications";
export type PublicStat = {
  metric_key: Key; label: string; source: "live" | "manual";
  manual_value: number; is_visible: boolean; sort_order: number; value: number;
};
const rowSql = `SELECT metric_key,label,source,manual_value::int,is_visible,sort_order
  FROM public.platform_public_stats ORDER BY sort_order,metric_key`;
async function readStats(): Promise<PublicStat[]> {
  const [counts] = await queryPostgres<{
    assets: string; companies: string; locations: string; verifications: string;
  }>(`SELECT
    (SELECT COUNT(*)::text FROM public.assets) AS assets,
    (SELECT COUNT(*)::text FROM public.tenants) AS companies,
    (SELECT COUNT(*)::text FROM public.locations WHERE is_active=TRUE) AS locations,
    (SELECT COUNT(*)::text FROM public.asset_verifications WHERE status='verified') AS verifications`);
  const rows = await queryPostgres<Omit<PublicStat,"value">>(rowSql);
  return rows.map(row => ({
    ...row,
    value: row.source === "manual" ? Number(row.manual_value) : Number(counts[row.metric_key]),
  }));
}
async function requirePlatformAdmin(userId: string) {
  const [admin] = await queryPostgres<{id:string}>(
    "SELECT id FROM public.profiles WHERE id=$1 AND is_saas_admin=TRUE AND is_active=TRUE LIMIT 1",
    [userId],
  );
  if (!admin) throw new Error("Platform administrator required");
}
export const getPublicStats = createServerFn({method:"GET"}).handler(async () =>
  (await readStats()).filter(row=>row.is_visible).map(({metric_key,label,value})=>({metric_key,label,value})),
);
export const getAdminPublicStats = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    await requirePlatformAdmin(context.userId);
    return readStats();
  });
export const updatePublicStat = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({
    metric_key:z.enum(["assets","companies","locations","verifications"]),
    label:z.string().trim().min(3).max(55),
    source:z.enum(["live","manual"]),
    manual_value:z.number().int().min(0).max(1_000_000_000),
    is_visible:z.boolean(),
  }).parse(input))
  .handler(async ({context,data}) => {
    await requirePlatformAdmin(context.userId);
    const rows = await queryPostgres<{metric_key:Key}>(`
      UPDATE public.platform_public_stats SET label=$2,source=$3,manual_value=$4,is_visible=$5
      WHERE metric_key=$1 RETURNING metric_key
    `,[data.metric_key,data.label,data.source,data.manual_value,data.is_visible]);
    if (!rows.length) throw new Error("Statistic not found");
    return {saved:true};
  });
