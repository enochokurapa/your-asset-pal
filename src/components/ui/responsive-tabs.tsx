import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * ResponsiveTabsList
 *
 * A drop-in replacement for <TabsList> that never lets tab buttons overlap on
 * mobile or tablet. Behaviour:
 *  - On mobile: horizontally scrolls (no wrap, no clipping, no overlap).
 *  - On sm+ (>=640px): wraps onto multiple rows with consistent spacing.
 *  - Height auto-adjusts to fit contents.
 *
 * Use together with <ResponsiveTabsTrigger> so each trigger is shrink-0.
 */
export const ResponsiveTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsList
    ref={ref}
    className={cn(
      "flex h-auto w-full items-stretch justify-start gap-1 overflow-x-auto p-1",
      "sm:flex-wrap sm:overflow-visible",
      // hide horizontal scrollbar visually while keeping scrollability
      "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className,
    )}
    {...props}
  />
));
ResponsiveTabsList.displayName = "ResponsiveTabsList";

export const ResponsiveTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn("shrink-0", className)}
    {...props}
  />
));
ResponsiveTabsTrigger.displayName = "ResponsiveTabsTrigger";
