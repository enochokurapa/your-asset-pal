import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { getPublicSaasBranding } from "@/lib/saas.functions";

export function usePlatformBranding() {
  const getBranding = useServerFn(getPublicSaasBranding);
  const query = useQuery({
    queryKey: ["public-saas-branding"],
    queryFn: () => getBranding(),
    staleTime: 60_000,
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
  const src = variant === "lockup"
    ? (data?.logoDataUrl || "/assetflow360-logo.svg")
    : (data?.iconDataUrl || "/assetflow360-mark.svg");

  return (
    <span className={cn("inline-flex items-center justify-center overflow-hidden", className)}>
      <img
        src={src}
        alt={alt || data?.name || "AssetFlow 360"}
        className={cn("h-full w-full object-contain", imageClassName)}
      />
    </span>
  );
}

export function PlatformName({ className }: { className?: string }) {
  const { data } = usePlatformBranding();
  return <span className={className}>{data?.name || "AssetFlow 360"}</span>;
}
