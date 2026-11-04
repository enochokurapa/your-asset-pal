import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listStatus, storeGateway, switchGateway, checkGateway } from "@/lib/payment-gateway.server";
const provider=z.enum(["yo","iotec"]);
const environment=z.enum(["sandbox","production"]);
const selector=z.object({provider,environment});
const credentials=z.discriminatedUnion("provider",[
  z.object({provider:z.literal("yo"),environment,username:z.string().min(1).max(150),password:z.string().min(1).max(500)}),
  z.object({provider:z.literal("iotec"),environment,clientId:z.string().min(1).max(200),clientSecret:z.string().min(1).max(500),walletId:z.string().uuid()})
]);
export const listPlatformPaymentGateways=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth]).handler(({context})=>listStatus(context.userId));
export const savePlatformPaymentGateway=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth]).inputValidator(input=>credentials.parse(input))
 .handler(({data,context})=>storeGateway(context.userId,data));
export const setPlatformGatewayEnabled=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth]).inputValidator(input=>selector.extend({enabled:z.boolean()}).parse(input))
 .handler(({data,context})=>switchGateway(context.userId,data));
export const testPlatformGateway=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth]).inputValidator(input=>selector.parse(input))
 .handler(({data,context})=>checkGateway(context.userId,data));
