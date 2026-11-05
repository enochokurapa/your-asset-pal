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
    staleTime: 30_000,
    refetchOnMount: false,
  });

  return query;
}

/** Run once per application, not for every logo in the header/footer. */
export function PlatformBrandingEffect() {
  const { data } = usePlatformBranding();
  useEffect(() => {
    if (!data || typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--platform-primary", data.primaryColor || "#C77435");
    root.style.setProperty("--platform-secondary", data.secondaryColor || "#4B47DC");

    // The favicon, installed app and Apple icon all use the admin-uploaded
    // platform mark. Cache-bust after a branding update so browsers reload it.
    const version = Date.now();
    for (const [rel, path] of [
      ["icon", "/api/branding/icon-192.png"],
      ["apple-touch-icon", "/api/branding/icon-192.png"],
      ["manifest", "/api/branding/manifest.webmanifest"],
    ] as const) {
      let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = `${path}?v=${version}`;
    }
  }, [data]);

  return null;
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
  const uploaded = variant === "lockup"
    ? (data?.logoDataUrl || data?.iconDataUrl)
    : (data?.iconDataUrl || data?.logoDataUrl);
  const [failedSrc,setFailedSrc] = useState<string|null>(null);
  const src = uploaded && failedSrc !== uploaded
    ? uploaded
    : variant === "lockup" ? "/assetflow360-logo.svg" : "/assetflow360-mark.svg";
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      {src ? <img
        src={src}
        alt={alt || data?.name || "AssetFlow 360"}
        onError={() => setFailedSrc(src)}
        className={cn("block h-full w-full object-contain", imageClassName)}
      /> : null}
    </span>
  );
}

export function PlatformName({ className }: { className?: string }) {
  const { data } = usePlatformBranding();
  return <span className={className}>{data?.name || "AssetFlow 360"}</span>;
}
