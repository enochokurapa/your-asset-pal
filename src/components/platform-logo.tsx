import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { getPublicSaasBranding } from "@/lib/saas.functions";

export function usePlatformBranding() {
  const getBranding = useServerFn(getPublicSaasBranding);
  const query = useQuery({
    queryKey: ["public-saas-branding"],
    queryFn: () => getBranding(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const data = query.data;
    if (!data || typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--platform-primary", data.primaryColor || "#C77435");
    root.style.setProperty("--platform-secondary", data.secondaryColor || "#4B47DC");

    const faviconHref = data.iconDataUrl || "/assetflow360-mark.svg";
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = faviconHref;
  }, [query.data]);

  return query;
}

export function PlatformLogo({
  className,
  imageClassName,
  alt,
  variant = "mark",
}: {
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
  variant?: "mark" | "lockup";
}) {
  const { data } = usePlatformBranding();
  const fallback = variant === "lockup" ? "/assetflow360-logo.svg" : "/assetflow360-mark.svg";
  // Branding assets are controlled by the platform administrator.
  // Bundled SVG assets are emergency fallbacks only.
  const uploaded = variant === "lockup" ? data?.logoDataUrl : data?.iconDataUrl;
  const [failedSrc,setFailedSrc] = useState<string|null>(null);
  // Always show the bundled logo immediately, including during branding fetches.
  // A missing/corrupt uploaded logo must never leave public navigation empty.
  const src = uploaded && failedSrc !== uploaded ? uploaded : fallback;
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <img src={src} alt={alt || data?.name || "AssetFlow 360"}
        onError={() => setFailedSrc(src)}
        className={cn("block h-full w-full object-contain", imageClassName)}
      />
    </span>
  );
}

export function PlatformName({ className }: { className?: string }) {
  const { data } = usePlatformBranding();
  return <span className={className}>{data?.name || "AssetFlow 360"}</span>;
}
