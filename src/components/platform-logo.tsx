import {useEffect,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {cn} from "@/lib/utils";
import {getPublicBrandingBasics} from "@/lib/public-branding.functions";

// Bundled approved artwork is a last-resort fallback when the live saved image
// cannot load. The public endpoint always serves SaaS Admin's configured logo.
const APPROVED_LOGO="/assetflow-approved-logo.svg";
const APPROVED_MARK="/assetflow-approved-mark.svg";

export function usePlatformBranding(){
 const get=useServerFn(getPublicBrandingBasics);
 return useQuery({queryKey:["public-branding-basics"],queryFn:()=>get(),
   staleTime:300_000,refetchOnMount:false,retry:1});
}

export function PlatformBrandingEffect(){
 const {data}=usePlatformBranding();
 useEffect(()=>{
  if(!data||typeof document==="undefined")return;
  document.documentElement.style.setProperty("--platform-primary",data.primaryColor||"#C77435");
  document.documentElement.style.setProperty("--platform-secondary",data.secondaryColor||"#4B47DC");
  // The browser/PWA icons are linked in SSR metadata so no client-side
  // Date.now() cache-busting or favicon replacement is required.
 },[data]);
 return null;
}

export function PlatformLogo({
 className,imageClassName,alt,variant="mark",
}:{
 className?:string;imageClassName?:string;fallbackClassName?:string;alt?:string;
 variant?:"mark"|"lockup";
}){
 const {data}=usePlatformBranding();
 const initial=variant==="lockup"?APPROVED_LOGO:APPROVED_MARK;
 const liveUrl=(variant==="lockup"?"/api/branding/logo.png":"/api/branding/icon-192.png")
   +(data?.updatedAt?"?v="+encodeURIComponent(data.updatedAt):"");
 const [failed,setFailed]=useState<string|null>(null);
 const src=failed===liveUrl?initial:liveUrl;
 return <span className={cn("inline-flex min-h-0 min-w-0 items-center justify-center overflow-visible",className)}>
  <img src={src} alt={alt||data?.name||"AssetFlow 360"} decoding="async"
    fetchPriority="high" onError={()=>setFailed(liveUrl)}
    className={cn("block h-full w-full max-h-full max-w-full object-contain object-center",imageClassName)}/>
 </span>;
}
export function PlatformName({className}:{className?:string}){
 const {data}=usePlatformBranding();
 return <span className={className}>{data?.name||"AssetFlow 360"}</span>;
}
