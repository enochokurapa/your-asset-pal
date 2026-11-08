import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHeroImage } from "@/lib/platform-hero.functions";

type MarketingPage = "features" | "solutions" | "pricing" | "about";

const PAGES = {
  features: {
    background: "/hero/assetflow-home-01-lifecycle.webp",
    eyebrow: "Platform",
    title: "Features",
    description: "Everything needed to register, verify and manage assets with clarity.",
  },
  solutions: {
    background: "/hero/assetflow-home-02-visibility.webp",
    eyebrow: "For your teams",
    title: "Solutions",
    description: "Connected asset workflows for finance, operations and field teams.",
  },
  pricing: {
    background: "/hero/assetflow-home-03-reporting.webp",
    eyebrow: "Plans",
    title: "Simple pricing",
    description: "Choose a plan that fits your team and grows with your organisation.",
  },
  about: {
    background: "/hero/assetflow-home-01-lifecycle.webp",
    eyebrow: "Our platform",
    title: "About AssetFlow 360",
    description: "Better information, clearer accountability and confident decisions.",
  },
} as const;

/**
 * Static page hero: only the short service statement animates.
 * Each SaaS Admin hero upload replaces background artwork, never page copy.
 */
export function PublicPageHero({page}:{page:MarketingPage}){
  const cfg=PAGES[page];
  const get=useServerFn(getHeroImage);
  const {data}=useQuery({
    queryKey:["public-hero-image",page],
    queryFn:()=>get({data:{page}}),
    staleTime:300000,
    retry:1,
  });
  const background=data?.url||cfg.background;

  return (
    <section aria-label={cfg.title} className="relative isolate mx-auto w-full max-w-7xl overflow-hidden border-y border-[#dce6e8] bg-[#faf8f4] text-[#243262] sm:border-x rounded-tr-none rounded-tl-none rounded-bl-none lg:rounded-br-[64px]">
      <img src={background} alt="" aria-hidden="true" loading="eager" decoding="async"
        width={1672} height={941}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[66%_center] opacity-80 lg:object-center" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#fff9f5] opacity-90 md:opacity-95 md:[mask-image:linear-gradient(to_right,black_0%,black_34%,transparent_94%)] md:bg-[#fff9f5]" />
      <div className="relative z-10 mx-auto flex min-h-[185px] w-full max-w-7xl flex-col justify-center px-5 py-7 sm:min-h-[225px] sm:px-8 sm:py-10 lg:min-h-[265px]">
        <div className="max-w-[620px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#CB7B30]">{cfg.eyebrow}</p>
          <h1 className="mt-2 text-[clamp(1.65rem,2.8vw,2.7rem)] font-semibold leading-[1.16] tracking-[-.035em] text-[#202e72]">{cfg.title}</h1>
          <p className="mt-2.5 max-w-[510px] text-[14px] leading-6 text-[#485172] sm:text-base">{cfg.description}</p>
        </div>
      </div>
    </section>
  );
}
