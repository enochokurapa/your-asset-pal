import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db=supabaseAdmin as any;
const URL="https://open.er-api.com/v6/latest/USD";
const HOUR=60*60*1000;
const MAX_AGE=48*HOUR;
let cached: {rate:number;timestamp:number;source:string}|null=null;
let nextFetch=0;
let pending:Promise<{rate:number;timestamp:number;source:string}|null>|null=null;
export type FxQuote={rate:number;source:string;updatedAt:string;fetchedAt:string};
async function stored(){
 const {data,error}=await db.from("platform_exchange_rates")
  .select("rate,source,source_timestamp,fetched_at").eq("pair","USD/UGX").maybeSingle();
 if(error||!data)return null;
 const rate=Number(data.rate),timestamp=new Date(data.source_timestamp).getTime();
 if(!Number.isFinite(rate)||rate<2000||rate>8000||!Number.isFinite(timestamp))return null;
 return {rate,timestamp,source:String(data.source||"open.er-api.com"),fetchedAt:String(data.fetched_at)};
}
async function fetchNew(){
 const response=await fetch(URL,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw new Error("Currency rate provider unavailable");
 const result=await response.json() as any;
 const rate=Number(result?.rates?.UGX);
 const timestamp=Number(result?.time_last_update_unix)*1000;
 if(result?.result!=="success"||result?.base_code!=="USD" ||
    !Number.isFinite(rate)||rate<2000||rate>8000 ||
    !Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>MAX_AGE)
   throw new Error("Exchange rate is invalid or outdated");
 const storedAt=new Date().toISOString();
 const {error}=await db.from("platform_exchange_rates").upsert({
  pair:"USD/UGX",rate,source:"ExchangeRate-API",source_timestamp:new Date(timestamp).toISOString(),
  fetched_at:storedAt,
 },{onConflict:"pair"});
 if(error)console.error("[FX] Unable to save validated exchange rate",error.code);
 return {rate,timestamp,source:"ExchangeRate-API",fetchedAt:storedAt};
}
export async function currentUsdUgxQuote(required=false):Promise<FxQuote|null>{
 const now=Date.now();
 if(cached && now-cached.timestamp < MAX_AGE && now<nextFetch)
  return {...cached,updatedAt:new Date(cached.timestamp).toISOString(),fetchedAt:new Date().toISOString()};
 if(!pending){
  pending=(async()=>{
   const historical=await stored();
   if(now>=nextFetch){
    nextFetch=now+HOUR;
    try{
      const fresh=await fetchNew();
      return {rate:fresh.rate,timestamp:fresh.timestamp,source:fresh.source};
    }catch(e){console.warn("[FX] Fetch unavailable, checking cached rate");}
   }
   if(historical&&now-historical.timestamp<MAX_AGE)return historical;
   return null;
  })().finally(()=>{pending=null;});
 }
 const quote=await pending;
 if(!quote){if(required)throw new Error("UGX checkout is temporarily unavailable because a current currency rate could not be verified");return null;}
 cached=quote;
 return {rate:quote.rate,source:quote.source,updatedAt:new Date(quote.timestamp).toISOString(),
  fetchedAt:new Date().toISOString()};
}
export function usdToUgx(usd:number,rate:number){
 if(!Number.isFinite(usd)||usd<=0||!Number.isFinite(rate)||rate<2000||rate>8000)
  throw new Error("Invalid payment conversion");
 const converted=Math.round((Math.round(usd*100)/100)*rate);
 if(!Number.isSafeInteger(converted)||converted<=0||converted>1_000_000_000)
  throw new Error("Converted payment is out of range");
 return converted;
}
