import {useEffect} from "react";
import {useLocation} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {recordPublicPageView,recordApplicationPageView} from "@/lib/platform-traffic.functions";
import {getServerAuthHeaders} from "@/lib/auth-headers";

type Source="direct"|"search"|"social"|"referral"|"campaign"|"internal";
export function sourceFromNavigation(url:string,referrer:string):Source {
  try{
    const page=new URL(url);
    if(page.searchParams.has("utm_source")||page.searchParams.has("utm_campaign"))return "campaign";
    if(!referrer)return "direct";
    const from=new URL(referrer);
    if(from.hostname===page.hostname)return "internal";
    if(/(^|\.)(google|bing|duckduckgo|yahoo|yandex)\./i.test(from.hostname))return "search";
    if(/(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|reddit)\./i.test(from.hostname))return "social";
    return "referral";
  }catch{return "direct";}
}
/** One event per page per browser tab session, with no identity or URL query strings sent. */
export function TrafficCapture({area}:{area:"website"|"application"}){
  const pathname=useLocation().pathname;
  const publicRecord=useServerFn(recordPublicPageView);
  const appRecord=useServerFn(recordApplicationPageView);
  useEffect(()=>{
    if(typeof window==="undefined")return;
    if(navigator.doNotTrack==="1" || (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true)return;
    const path=pathname.slice(0,90);
    const key=`af-traffic-${area}-${path}`;
    try{
      if(window.sessionStorage.getItem(key))return;
      window.sessionStorage.setItem(key,"1");
    }catch{return;}
    const source=area==="application"?"internal":sourceFromNavigation(window.location.href,document.referrer);
    if(area==="website")void publicRecord({data:{page:path,source}}).catch(()=>{});
    else void getServerAuthHeaders().then(headers=>appRecord({headers,data:{page:path,source}})).catch(()=>{});
  },[area,pathname,publicRecord,appRecord]);
  return null;
}
