import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Collapsible as BaseCollapsible,
  CollapsibleContent as BaseCollapsibleContent,
  CollapsibleTrigger as BaseCollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const collapsibleTriggerPresentations = cva("", {
  variants: {
    presentation: {
      onboarding:
        "focus-visible:border-onboarding-focus focus-visible:ring-onboarding-focus/25 gap-1 rounded-md px-1.5 py-0.5 text-sm text-white/58 transition-colors outline-none hover:text-white focus-visible:ring-3",
      health:
        "hover:bg-muted/50 focus-visible:ring-ring/50 group-data-[tone=error]/health-check:focus-visible:ring-destructive/30 group-data-[tone=error]/health-check:hover:bg-destructive/10 gap-3 rounded-md p-2 transition-colors outline-none focus-visible:ring-3",
    },
  },
});

function CollapsibleTrigger({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCollapsibleTrigger> &
  VariantProps<typeof collapsibleTriggerPresentations>) {
  return (
    <BaseCollapsibleTrigger
      className={cn(
        collapsibleTriggerPresentations({ presentation }),
        className
      )}
      {...props}
    />
  );
}

const collapsibleContentPresentations = cva("", {
  variants: {
    presentation: {
      spaced: "pt-2",
    },
  },
});

function CollapsibleContent({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCollapsibleContent> &
  VariantProps<typeof collapsibleContentPresentations>) {
  return (
    <BaseCollapsibleContent
      className={cn(
        collapsibleContentPresentations({ presentation }),
        className
      )}
      {...props}
    />
  );
}

const collapsiblePresentations = cva("", {
  variants: {
    presentation: {
      health:
        "data-[tone=error]:border-destructive/30 data-[tone=error]:bg-destructive/5 rounded-md data-[tone=error]:border",
    },
  },
});

function Collapsible({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCollapsible> &
  VariantProps<typeof collapsiblePresentations>) {
  return (
    <BaseCollapsible
      className={cn(collapsiblePresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
