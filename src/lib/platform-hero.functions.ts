import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {
  getPublicHeroImage, listHeroSettings, saveHeroImage, deleteHeroImage
} from "@/lib/platform-hero.server";

const page=z.enum(["home","home_2","home_3","features","solutions","pricing","about"]);
export const getHeroImage=createServerFn({method:"GET"})
  .inputValidator(value=>z.object({page}).parse(value))
  .handler(({data})=>getPublicHeroImage(data.page));

export const listPlatformHeroImages=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(({context})=>listHeroSettings(context.userId));

export const setPlatformHeroImage=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(value=>z.object({
    page,
    dataUrl:z.string().min(100).max(4_100_000),
    altText:z.string().trim().min(15).max(220),
    layout:z.enum(["standard","approved_home_lifecycle"]),
  }).parse(value))
  .handler(({context,data})=>saveHeroImage(context.userId,data.page,data.dataUrl,data.altText,data.layout));

export const clearPlatformHeroImage=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(value=>z.object({page}).parse(value))
  .handler(({context,data})=>deleteHeroImage(context.userId,data.page));
