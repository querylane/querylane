import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Badge as BaseBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleTone } from "./role-tone";

const badgePresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono text-xs",
      filter: "gap-1 truncate font-mono text-xs",
      count: "px-1 font-mono text-xs",
      "schema-warning": "bg-chart-4/15 px-1 text-chart-4 text-xs",
      "schema-info": "bg-chart-1/15 px-1 text-chart-1 text-xs",
      compact: "px-1 text-xs",
      onboarding:
        "border-white/10 bg-white/7 px-2 py-0.5 text-white/72 text-xs",
      pill: "rounded-full px-2 text-xs",
      "identifier-pill": "rounded-full px-2 font-mono text-xs",
      "muted-pill": "rounded-full px-2 text-muted-foreground text-xs",
      "grid-count":
        "gap-1.5 rounded-md border-border bg-muted/40 px-2.5 font-normal text-muted-foreground",
      "onboarding-success":
        "border-positive-400/28 bg-positive-500/10 px-2.5 py-0.5 text-positive-200 text-xs",
      error: "gap-1.5 border-destructive/40 text-destructive",
      "onboarding-complete":
        "border-positive-400/40 bg-positive-500/14 px-2.5 text-positive-200",
      "onboarding-running": "border-white/16 bg-white/10 px-2.5 text-white",
      "onboarding-error":
        "border-negative-400/35 bg-negative-500/14 px-2.5 text-negative-100",
      "onboarding-pending": "border-white/10 bg-white/4 px-2.5 text-white/62",
      index: "gap-1 rounded-full px-2 py-1 font-mono text-xs",
      encoding:
        "text-(length:--text-label-sm) rounded-md px-2 font-mono tracking-wide",
      grant: "gap-1.5 rounded-sm px-1.5",
      warning:
        "gap-1 border-warning-500/30 text-warning-700 dark:text-warning-400",
      status: "px-2.5 py-0.5 text-xs",
      "object-kind": "rounded-full px-1.5 font-mono text-xs",
      activity: "font-mono",
      "map-compact": "text-(length:--text-micro-sm) px-1",
      "map-default": "text-(length:--text-micro) px-1.5",
      "policy-restrictive":
        "border-transparent bg-warning-500/15 font-mono text-warning-700 text-xs dark:text-warning-300",
      "policy-permissive":
        "border-transparent bg-muted font-mono text-muted-foreground text-xs",
      "access-active":
        "text-(length:--text-micro-lg) rounded-sm font-medium uppercase tabular-nums tracking-wide",
      "access-warning":
        "text-(length:--text-micro-lg) rounded-sm border-warning-500/30 bg-warning-500/10 font-medium text-warning-700 uppercase tabular-nums tracking-wide dark:text-warning-400",
      "access-inactive":
        "text-(length:--text-micro-lg) rounded-sm font-medium text-muted-foreground/50 uppercase tabular-nums tracking-wide",
      "expiry-expired": "text-destructive",
      "expiry-soon": "text-warning-600 dark:text-warning-400",
    },
    tone: {
      default: "",
      success: "bg-positive-500/10 text-positive-700 dark:text-positive-300",
      warning: "bg-warning-500/10 text-warning-700 dark:text-warning-300",
      ghost: "border-transparent text-muted-foreground",
      "constraint-warning":
        "border-transparent bg-warning-500/15 text-warning-700 dark:text-warning-300",
    },
  },
});

function Badge({
  roleKind,
  tone,
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseBadge> &
  VariantProps<typeof badgePresentations> &
  VariantProps<typeof roleTone>) {
  return (
    <BaseBadge
      className={cn(
        roleTone({ roleKind }),
        badgePresentations({ presentation, tone }),
        className
      )}
      {...props}
    />
  );
}

export { Badge };
