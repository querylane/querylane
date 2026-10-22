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
      "sql-count": "px-1.5 font-mono text-xs",
      "schema-warning": "bg-chart-4/15 text-chart-4 px-1 text-xs",
      "schema-info": "bg-chart-1/15 text-chart-1 px-1 text-xs",
      compact: "px-1 text-xs",
      onboarding:
        "border-white/10 bg-white/7 px-2 py-0.5 text-xs text-white/72",
      pill: "rounded-full px-2 text-xs",
      "identifier-pill": "rounded-full px-2 font-mono text-xs",
      "muted-pill": "text-muted-foreground rounded-full px-2 text-xs",
      "grid-count":
        "border-border bg-muted/40 text-muted-foreground gap-1.5 rounded-md px-2.5 font-normal",
      "onboarding-success":
        "border-positive-400/28 bg-positive-500/10 text-positive-200 px-2.5 py-0.5 text-xs",
      error: "border-destructive/40 text-destructive gap-1.5",
      "onboarding-complete":
        "border-positive-400/40 bg-positive-500/14 text-positive-200 px-2.5",
      "onboarding-running": "border-white/16 bg-white/10 px-2.5 text-white",
      "onboarding-error":
        "border-negative-400/35 bg-negative-500/14 text-negative-100 px-2.5",
      "onboarding-pending": "border-white/10 bg-white/4 px-2.5 text-white/62",
      index: "gap-1 rounded-full px-2 py-1 font-mono text-xs",
      encoding:
        "rounded-md px-2 font-mono tracking-wide text-(length:--text-label-sm)",
      grant: "gap-1.5 rounded-sm px-1.5",
      warning:
        "border-warning-500/30 text-warning-700 dark:text-warning-400 gap-1",
      status: "px-2.5 py-0.5 text-xs",
      "object-kind": "rounded-full px-1.5 font-mono text-xs",
      activity: "font-mono",
      "map-compact": "px-1 text-(length:--text-micro-sm)",
      "map-default": "px-1.5 text-(length:--text-micro)",
      "policy-restrictive":
        "bg-warning-500/15 text-warning-700 dark:text-warning-300 border-transparent font-mono text-xs",
      "policy-permissive":
        "bg-muted text-muted-foreground border-transparent font-mono text-xs",
      "access-active":
        "rounded-sm font-medium tracking-wide text-(length:--text-micro-lg) uppercase tabular-nums",
      "access-warning":
        "border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-400 rounded-sm font-medium tracking-wide text-(length:--text-micro-lg) uppercase tabular-nums",
      "access-inactive":
        "text-muted-foreground/50 rounded-sm font-medium tracking-wide text-(length:--text-micro-lg) uppercase tabular-nums",
      "expiry-expired": "text-destructive",
      "expiry-soon": "text-warning-600 dark:text-warning-400",
    },
    tone: {
      default: "",
      success: "bg-positive-500/10 text-positive-700 dark:text-positive-300",
      warning: "bg-warning-500/10 text-warning-700 dark:text-warning-300",
      ghost: "text-muted-foreground border-transparent",
      "constraint-warning":
        "bg-warning-500/15 text-warning-700 dark:text-warning-300 border-transparent",
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
