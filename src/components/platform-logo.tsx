import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { getPublicSaasBranding } from "@/lib/saas.functions";

export function PlatformLogo({
  className,
  imageClassName,
  alt = "AssetFlow 360",
  variant = "mark",
}: {
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
  variant?: "mark" | "lockup";
}) {
  const getBranding = useServerFn(getPublicSaasBranding);
  const { data } = useQuery({
    queryKey: ["public-saas-branding"],
    queryFn: () => getBranding(),
    staleTime: 60_000,
  });

  const src = data?.logoDataUrl || (variant === "lockup" ? "/assetflow360-logo.svg" : "/assetflow360-mark.svg");

  return (
    <span className={cn("inline-flex items-center justify-center overflow-hidden", className)}>
      <img src={src} alt={alt} className={cn("h-full w-full object-contain", imageClassName)} />
    </span>
  );
}
