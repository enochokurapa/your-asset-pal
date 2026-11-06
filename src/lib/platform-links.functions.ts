import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryPostgres } from "@/lib/postgres.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ImportantLink = {
  id: string; title: string; url: string; description: string;
  sort_order: number; is_active: boolean;
};

const linkFields = "id,title,url,description,sort_order,is_active";
const linkInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(80),
  url: z.string().trim().max(500).url(),
  description: z.string().trim().max(180).default(""),
  sort_order: z.number().int().min(0).max(1000).default(0),
  is_active: z.boolean().default(true),
});
function validatedHttpsUrl(value: string): string {
  const uri = new URL(value);
  if (uri.protocol !== "https:" || !uri.hostname || uri.username || uri.password) {
    throw new Error("Important links must be public HTTPS URLs without embedded credentials.");
  }
  return uri.toString();
}
async function ensurePlatformAdmin(userId: string) {
  const [admin] = await queryPostgres<{ id: string }>(
    "SELECT id FROM public.profiles WHERE id=$1 AND is_saas_admin=TRUE AND is_active=TRUE LIMIT 1",
    [userId],
  );
  if (!admin) throw new Error("Platform administrator privileges required");
}
export const getPublicImportantLinks = createServerFn({ method: "GET" })
  .handler(async () => {
    const rows = await queryPostgres<ImportantLink>(
      `SELECT ${linkFields} FROM public.platform_important_links
       WHERE is_active=TRUE ORDER BY sort_order ASC, created_at ASC LIMIT 24`,
    );
    return rows.map(({ id, title, url, description }) => ({ id, title, url, description }));
  });

export const getAdminImportantLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePlatformAdmin(context.userId);
    return queryPostgres<ImportantLink>(
      `SELECT ${linkFields} FROM public.platform_important_links ORDER BY sort_order ASC, created_at ASC LIMIT 50`,
    );
  });

export const saveImportantLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    await ensurePlatformAdmin(context.userId);
    const url = validatedHttpsUrl(data.url);
    if (data.id) {
      const changed = await queryPostgres<{ id: string }>(
        `UPDATE public.platform_important_links SET title=$2,url=$3,description=$4,
         sort_order=$5,is_active=$6,updated_at=NOW() WHERE id=$1 RETURNING id`,
        [data.id, data.title, url, data.description, data.sort_order, data.is_active],
      );
      if (!changed.length) throw new Error("Important link not found");
    } else {
      const [{ count }] = await queryPostgres<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM public.platform_important_links",
      );
      if (Number(count) >= 24) throw new Error("A maximum of 24 important links is supported");
      await queryPostgres(
        `INSERT INTO public.platform_important_links
         (title,url,description,sort_order,is_active) VALUES($1,$2,$3,$4,$5)`,
        [data.title, url, data.description, data.sort_order, data.is_active],
      );
    }
    return { ok: true };
  });

export const deleteImportantLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensurePlatformAdmin(context.userId);
    await queryPostgres("DELETE FROM public.platform_important_links WHERE id=$1", [data.id]);
    return { ok: true };
  });
