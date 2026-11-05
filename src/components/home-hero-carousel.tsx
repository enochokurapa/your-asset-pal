import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { getHeroImage } from "@/lib/platform-hero.functions";

const SLIDES = [
  {
    key: "home" as const,
    image: "/hero/assetflow-home-01-lifecycle.webp",
    alt: "Seven-step staircase illustrating the full fixed-asset management lifecycle",
    eyebrow: "Complete asset lifecycle",
    heading: "Every asset.",
    emphasis: "Fully accounted for.",
    services: "Asset registration · Barcode tagging · Verification · Lifecycle control",
    description: "From the first entry in your asset register to final disposal, manage every step with one dependable system.",
    primary: "Start free trial",
    primaryLink: "/register" as const,
    secondary: "Explore features",
    secondaryLink: "/features" as const,
  },
  {
    key: "home_2" as const,
    image: "/hero/assetflow-home-02-visibility.webp",
    alt: "Connected asset locations, branches and accountability illustrated in navy and orange",
    eyebrow: "Visibility and accountability",
    heading: "Know where every",
    emphasis: "asset belongs.",
    services: "Branch locations · Custodian assignments · Transfers · Physical audits",
    description: "Connect assets to the right people and places. Keep a clear record of responsibility, location and movement.",
    primary: "Explore solutions",
    primaryLink: "/solutions" as const,
    secondary: "See verification tools",
    secondaryLink: "/features" as const,
  },
  {
    key: "home_3" as const,
    image: "/hero/assetflow-home-03-reporting.webp",
    alt: "Enterprise asset reporting and performance analytics visual",
    eyebrow: "Reporting and insight",
    heading: "Turn asset records",
    emphasis: "into better decisions.",
    services: "Asset reports · Depreciation · Audit history · Management oversight",
    description: "Bring reliable asset information together for reporting, planning and more confident decisions.",
    primary: "Explore reporting",
    primaryLink: "/features" as const,
    secondary: "View pricing",
    secondaryLink: "/pricing" as const,
  },
];

const STAGES = ["Register", "Tag", "Assign", "Verify", "Locate", "Maintain", "Report"];
const SLIDE_DURATION_MS = 7000;

/**
 * The images contain artwork ONLY. This component owns every heading, service,
 * CTA and stage label as accessible HTML. No text is baked into the assets.
 * SaaS admins may replace each image via Hero Images > Homepage Slide 1–3.
 */
export function HomeHeroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const touchStart = useRef<number | null>(null);
  const get = useServerFn(getHeroImage);
  const slide1 = useQuery({
    queryKey: ["public-hero-image", "home"],
    queryFn: () => get({ data: { page: "home" } }),
    staleTime: 300_000,
    retry: 1,
  });
  const slide2 = useQuery({
    queryKey: ["public-hero-image", "home_2"],
    queryFn: () => get({ data: { page: "home_2" } }),
    staleTime: 300_000,
    enabled: active >= 1,
    retry: 1,
  });
  const slide3 = useQuery({
    queryKey: ["public-hero-image", "home_3"],
    queryFn: () => get({ data: { page: "home_3" } }),
    staleTime: 300_000,
    enabled: active >= 2,
    retry: 1,
  });
  const savedImages = [slide1.data?.url, slide2.data?.url, slide3.data?.url];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(query.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    query.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      query.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || !pageVisible) return;
    const timer = window.setInterval(() => setActive(i => (i + 1) % SLIDES.length), SLIDE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, pageVisible]);

  const move = (direction: number) => setActive(i => (i + direction + SLIDES.length) % SLIDES.length);
  const slide = SLIDES[active];

  return (
    <section
      aria-label="AssetFlow 360 homepage"
      aria-roledescription="carousel"
      className="relative isolate overflow-hidden bg-[#eef4fb] text-[#102b3c]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onTouchStart={event => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={event => {
        if (touchStart.current == null) return;
        const delta = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > 65) move(delta < 0 ? 1 : -1);
      }}
    >
      <style>{`
        @keyframes af-hero-copy { from { opacity: 0; transform: translateY(13px); } to { opacity: 1; transform: translateY(0); } }
        .af-hero-copy { animation: af-hero-copy 550ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .af-hero-copy { animation: none !important; }
          .af-hero-background { transition: none !important; }
        }
      `}</style>
      <div className="relative min-h-[650px] sm:min-h-[710px] lg:min-h-[750px]">
        {SLIDES.map((item, i) => (
          <div
            key={item.key}
            aria-hidden="true"
            className={`af-hero-background pointer-events-none absolute inset-0 transition-opacity duration-700 ease-in-out ${i === active ? "opacity-100" : "opacity-0"}`}
          >
            <img
              src={savedImages[i] || item.image}
              alt=""
              width={1672}
              height={941}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "low"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-[61%_center] sm:object-center"
            />
          </div>
        ))}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f4f8ff]/[.98] via-[#f4f8ff]/[.90] to-[#f4f8ff]/[.08] lg:via-[#f4f8ff]/[.74]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#f4f8ff]/50 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex min-h-[650px] max-w-7xl flex-col justify-center px-6 pb-28 pt-12 sm:min-h-[710px] sm:px-8 lg:min-h-[750px] lg:px-10">
          <div key={slide.key} className="af-hero-copy max-w-[645px]">
            <p className="mb-5 inline-flex items-center gap-2 rounded-lg border border-[#cfdce7] bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#a65a32] shadow-sm backdrop-blur-sm">
              <span className="h-2 w-2 rounded-sm bg-[#c77435]" aria-hidden="true" />
              {slide.eyebrow}
            </p>
            <h1 className="max-w-[650px] text-[clamp(2.55rem,4.6vw,4.7rem)] font-extrabold leading-[1.08] tracking-[-.042em] text-[#102b3c]">
              {slide.heading} <span className="text-[#bf6a39]">{slide.emphasis}</span>
            </h1>
            <p className="mt-5 max-w-[585px] text-base font-semibold leading-7 text-[#244e68] sm:text-lg">
              {slide.services}
            </p>
            <p className="mt-4 max-w-[530px] text-base leading-8 text-[#496477] sm:text-lg">
              {slide.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={slide.primaryLink}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#b56435] bg-[#c77435] px-6 text-sm font-bold text-white shadow-[0_6px_14px_rgba(160,80,36,.18)] transition-colors hover:bg-[#a85d30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c]"
              >
                {slide.primary} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to={slide.secondaryLink}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#9bb3c1] bg-white/85 px-6 text-sm font-bold text-[#17394d] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c]"
              >
                {slide.secondary}
              </Link>
            </div>
          </div>
          <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between gap-4 sm:left-8 sm:right-8 lg:left-10 lg:right-10">
            <div className="flex items-center gap-2" role="group" aria-label="Choose homepage slide">
              {SLIDES.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`Go to slide ${i + 1} of 3: ${item.eyebrow}`}
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => setActive(i)}
                  className={`h-2.5 rounded-sm transition-[width,background-color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#102b3c] ${i === active ? "w-10 bg-[#c77435]" : "w-5 bg-[#95aebd] hover:bg-[#536d82]"}`}
                />
              ))}
              <span className="ml-2 text-xs font-semibold tabular-nums text-[#496477]">{active + 1} / 3</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous slide" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c1d0da] bg-white/85 text-[#17394d] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#102b3c]">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" aria-label={paused ? "Resume automatic carousel" : "Pause automatic carousel"} onClick={() => setPaused(v => !v)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c1d0da] bg-white/85 text-[#17394d] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#102b3c]">
                {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button type="button" aria-label="Next slide" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c1d0da] bg-white/85 text-[#17394d] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#102b3c]">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 border-t border-[#d8e3ea] bg-white/90 px-5 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto sm:justify-between">
          <span className="shrink-0 pr-2 text-xs font-bold uppercase tracking-[.13em] text-[#435c6f]">The 7 steps</span>
          {STAGES.map((stage, i) => (
            <div key={stage} className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#18374a]">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e6c0a4] bg-[#fff1e8] text-xs font-bold text-[#b36534]">{i + 1}</span>
              <span>{stage}</span>
              {i < STAGES.length - 1 && <Check className="ml-1 h-3 w-3 text-[#b9c7d0]" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
