import {createServerFn} from "@tanstack/react-start";
import {queryPostgres} from "@/lib/postgres.server";

/** Lightweight public branding descriptor: never ship MB-sized data URLs
 *  to each visitor just to render the header and footer. */
export const getPublicBrandingBasics=createServerFn({method:"GET"}).handler(async()=>{
 const [row]=await queryPostgres<{
  platform_name:string|null;platform_primary_color:string|null;
  platform_secondary_color:string|null;updated_at:string|null;
 }>(`SELECT platform_name,platform_primary_color,platform_secondary_color,
   to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
   FROM public.saas_settings WHERE id=TRUE LIMIT 1`);
 return {
  name:row?.platform_name||"AssetFlow 360",
  primaryColor:row?.platform_primary_color||"#C77435",
  secondaryColor:row?.platform_secondary_color||"#4B47DC",
  updatedAt:row?.updated_at||null,
 };
});
