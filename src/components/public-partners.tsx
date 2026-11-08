import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getPublicPartners} from "@/lib/platform-partners.functions";

export function PublicPartners(){
 const get=useServerFn(getPublicPartners);
 const {data=[]}=useQuery({queryKey:["public-partner-logos"],queryFn:()=>get(),staleTime:300000});
 if(!data.length)return null;
 const repeated=data.length>3?[...data,...data]:data;
 return <section aria-label="Our partners" className="overflow-hidden border-y border-[#e0e8ed] bg-white px-5 py-10 sm:px-8 sm:py-14">
  <div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#bc6b3d]">Trusted relationships</p><h2 className="mt-2 text-xl font-bold tracking-tight text-[#163a51] sm:text-2xl">Our partners</h2></div>
  <div className="af-partners-viewport relative overflow-hidden" role="group" aria-label="Partner logos">
   <div className={`af-partners-track flex w-max items-center gap-4 py-2 sm:gap-6 ${data.length>3?"af-partners-moving":""}`}>
    {repeated.map((partner,i)=><div key={`${partner.id}-${i}`} aria-hidden={i>=data.length} className="flex h-[84px] w-[158px] shrink-0 items-center justify-center rounded-xl border border-[#e1e9ee] bg-[#f9fbfc] px-5 py-4 shadow-[0_3px_16px_rgba(18,53,75,.05)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-md sm:h-[106px] sm:w-[205px]">
      <img src={partner.logo_data_url} alt={i<data.length?partner.name+" logo":""} loading="lazy" className="max-h-full max-w-full object-contain"/>
    </div>)}
   </div>
  </div></div>
  <style>{`@keyframes afPartnerMarquee{to{transform:translateX(-50%)}}.af-partners-moving{animation:afPartnerMarquee 33s linear infinite}.af-partners-viewport:hover .af-partners-moving,.af-partners-viewport:focus-within .af-partners-moving{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.af-partners-moving{animation:none!important}.af-partners-viewport{overflow-x:auto}}`}</style>
 </section>;
}
