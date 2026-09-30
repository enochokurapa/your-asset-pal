import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublicSaasBranding } from "@/lib/saas.functions";

export function PlatformLogo({
  className,
  imageClassName,
  fallbackClassName,
  alt = "AssetFlow 360",
}: {
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
}) {
  const getBranding = useServerFn(getPublicSaasBranding);
  const { data } = useQuery({
    queryKey: ["public-saas-branding"],
    queryFn: () => getBranding(),
    staleTime: 60_000,
  });

  if (data?.logoDataUrl) {
    return (
      <span className={cn("inline-flex items-center justify-center overflow-hidden", className)}>
        <img src={data.logoDataUrl} alt={alt} className={cn("h-full w-full object-contain", imageClassName)} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center justify-center bg-primary text-primary-foreground", className, fallbackClassName)}>
      <Boxes className="h-1/2 w-1/2" />
    </span>
  );
}
