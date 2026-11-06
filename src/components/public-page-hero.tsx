import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { getHeroImage } from "@/lib/platform-hero.functions";
import { HeroTypingLine } from "@/components/hero-typing-line";

type MarketingPage = "features" | "solutions" | "pricing" | "about";

const PAGES = {
  features: {
    background: "/hero/assetflow-home-01-lifecycle.webp",
    eyebrow: "Platform capabilities",
    title: "A complete system for",
    accent: "every asset.",
    description: "Capture, classify, locate, verify and report on fixed assets with workflows that fit how your organisation operates.",
    lineLabel: "What you can manage",
    lines: ["Asset registers and imports","Physical verification and audits","Locations and custodians","Depreciation and reporting"],
    action: "Explore pricing",
    target: "/pricing" as const,
  },
  solutions: {
    background: "/hero/assetflow-home-02-visibility.webp",
    eyebrow: "Practical asset workflows",
    title: "Know what you own.",
    accent: "Wherever it works.",
    description: "An adaptable platform for finance, operations and field teams managing assets across different branches and locations.",
    lineLabel: "Built for",
    lines: ["Finance and accounting teams","Operations and branch teams","Field verification officers","Multi-location organisations"],
    action: "Explore features",
    target: "/features" as const,
  },
  pricing: {
    background: "/hero/assetflow-home-03-reporting.webp",
    eyebrow: "Plans and pricing",
    title: "Simple plans.",
    accent: "Room to grow.",
    description: "Find the right plan for your team and asset capacity. Choose optional modules and additional users as your needs expand.",
    lineLabel: "Flexible options for",
    lines: ["Growing asset registers","New teams and branches","Expanding user capacity","Optional business modules"],
    action: "Start free trial",
    target: "/register" as const,
  },
  about: {
    background: "/hero/assetflow-home-01-lifecycle.webp",
    eyebrow: "About AssetFlow 360",
    title: "Clear asset records.",
    accent: "Better decisions.",
    description: "AssetFlow 360 brings essential fixed asset workflows together, from registration and physical verification to movement and reporting.",
    lineLabel: "Designed for",
    lines: ["Clear accountability","Reliable asset information","Flexible asset registers","Confident operational decisions"],
    action: "Explore solutions",
    target: "/solutions" as const,
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

  return <section aria-label={cfg.eyebrow}
    className="relative isolate w-full overflow-hidden border-b border-[#e8ddd0] bg-[#fff8ef] text-[#292b2d]">
    {/* Background artwork is illustrative only; it must never dictate the brand palette. */}
    <img src={background} alt="" aria-hidden="true" width={1672} height={941}
      fetchPriority="high" decoding="async"
      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[65%_center] opacity-50 grayscale sepia-[.28] saturate-50 lg:object-center"
    />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#fffaf5]/[.99] via-[#fffaf5]/[.95] to-[#fff6ed]/[.52] lg:via-[#fffaf5]/[.89] lg:to-[#fff6ed]/[.28]"/>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#fff8f0]/70 via-transparent to-transparent"/>
    <div className="relative z-10 mx-auto flex min-h-[470px] w-full max-w-7xl flex-col justify-center px-5 py-16 sm:min-h-[515px] sm:px-8 sm:py-20">
      <div className="max-w-[690px]">
        <p className="border-l-[3px] border-[#c77435] pl-3 text-xs font-bold uppercase tracking-[.16em] text-[#a7562c]">{cfg.eyebrow}</p>
        <h1 className="mt-6 max-w-[690px] text-[clamp(2.25rem,4.2vw,4.15rem)] font-extrabold leading-[1.12] tracking-[-.035em] text-[#252d30]">
          {cfg.title} <span className="text-[#bf6835]">{cfg.accent}</span>
        </h1>
        <div className="mt-6 max-w-[610px]">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-[#ab582f]">{cfg.lineLabel}</p>
          <HeroTypingLine phrases={cfg.lines} initialFullPhrase
            className="mt-2 min-h-[3.5rem] max-w-[610px] text-lg font-semibold leading-7 text-[#3c4b51] sm:min-h-9 sm:text-xl"/>
        </div>
        <p className="mt-4 max-w-[610px] text-base leading-8 text-[#51616a]">
          {cfg.description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#c77435] px-6 text-sm font-bold text-white transition-colors hover:bg-[#a85b2d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c77435]">
            Start free trial <ArrowRight className="h-4 w-4" aria-hidden="true"/>
          </Link>
          <Link to={cfg.target} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#c9ad95] bg-white/90 px-6 text-sm font-bold text-[#68452f] transition-colors hover:border-[#c77435] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c77435]">
            {cfg.action}
          </Link>
        </div>
      </div>
    </div>
  </section>;
}
