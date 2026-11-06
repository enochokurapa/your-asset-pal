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
    <section aria-label={cfg.title} className="relative isolate w-full overflow-hidden border-b border-[#e4e7e8] bg-[#e9eff0] text-[#263742]">
      <img src={background} alt="" aria-hidden="true" loading="eager" decoding="async"
        width={1672} height={941}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[66%_center] opacity-[.24] saturate-[.68] lg:object-center" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#e7eeed]/[.98] via-[#edf1ee]/[.90] to-[#e6e9e7]/[.34] lg:to-[#e2e8e9]/[.12]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_13%_90%,rgba(199,116,53,.14),transparent_62%)]" />
      <div className="relative z-10 mx-auto flex min-h-[240px] w-full max-w-7xl flex-col justify-center px-5 py-12 sm:min-h-[270px] sm:px-8 sm:py-14 lg:min-h-[300px]">
        <div className="max-w-[620px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#aa673f]">{cfg.eyebrow}</p>
          <h1 className="mt-3 text-[clamp(1.9rem,3vw,2.9rem)] font-semibold leading-[1.16] tracking-[-.035em] text-[#243744]">{cfg.title}</h1>
          <p className="mt-4 max-w-[530px] text-[15px] leading-7 text-[#4b5f68] sm:text-base">{cfg.description}</p>
        </div>
      </div>
    </section>
  );
}
