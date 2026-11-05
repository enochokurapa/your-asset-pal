import {useServerFn} from "@tanstack/react-start";
import {useQuery} from "@tanstack/react-query";
import {getHeroImage} from "@/lib/platform-hero.functions";
import type {HeroPage} from "@/lib/platform-hero.server";
import {Link} from "@tanstack/react-router";
import {ArrowRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {ReactNode} from "react";

/**
 * Artwork managed by the SaaS administrator. With no uploaded image the
 * original page hero is preserved; a missing image never breaks the page.
 * Hero bytes are stored in PostgreSQL, not the currently-unavailable R2 bucket.
 */
export function ManagedPublicHero({page,children}:{
  page:HeroPage;children:ReactNode;
}){
 const load=useServerFn(getHeroImage);
 const {data,error}=useQuery({
  queryKey:["public-hero-image",page],
  queryFn:()=>load({data:{page}}),
  staleTime:5*60*1000,
  retry:1,
 });
 if(error||!data)return <>{children}</>;
 const isHome=page==="home";
 return <section aria-label={"AssetFlow 360 "+page+" hero"} className="relative overflow-hidden bg-[#F5F8FA]">
   <div className="relative overflow-hidden">
     <img
       src={data.url}
       alt={data.altText}
       width={data.width}
       height={data.height}
       decoding="async"
       fetchPriority="high"
       className="block h-auto w-full"
       style={isHome?{marginTop:"-5.45%"}:undefined}
     />
     {isHome&&<div className="hidden md:block">
      <Link to="/register" aria-label="Start your free trial" className="absolute left-[3.6%] top-[52.6%] h-[9.3%] w-[14.1%] rounded-md focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#C77435]"/>
      <Link to="/about" aria-label="Learn about AssetFlow 360" className="absolute left-[19.3%] top-[52.6%] h-[9.3%] w-[13.4%] rounded-md focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#C77435]"/>
     </div>}
   </div>
   <div className="flex flex-wrap justify-center gap-3 px-5 pb-6 pt-3 md:hidden">
      <Button asChild className="bg-[#C77435] text-white hover:bg-[#A45E2B]">
       <Link to="/register">Start free trial <ArrowRight className="ml-2 h-4 w-4"/></Link>
      </Button>
      <Button asChild variant="outline" className="border-[#102B3C] text-[#102B3C]">
       <Link to="/features">Explore the platform</Link>
      </Button>
   </div>
 </section>;
}
