import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Button as BaseButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const buttonPresentations = cva("", {
  variants: {
    presentation: {
      warning: "text-warning-600 hover:text-warning-700",
      quiet: "text-muted-foreground hover:text-foreground",
      "sidebar-action":
        "gap-2 border-border bg-background px-2.5 font-normal text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      "compact-group": "gap-2 rounded-sm px-1.5 py-1",
      clear: "p-0 text-muted-foreground hover:text-foreground",
      micro: "px-1.5 text-xs",
      "tree-disclosure":
        "gap-2 px-2 py-0 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:text-foreground dark:hover:bg-transparent",
      unpadded: "p-0",
      muted: "text-muted-foreground",
      "icon-label": "gap-2",
      segmented: "rounded-none border-0",
      "grant-group":
        "gap-2 rounded-sm px-1.5 py-1 font-normal hover:bg-foreground/3",
      "grant-count": "px-2 font-normal text-muted-foreground text-xs",
      "grant-entity":
        "gap-3 rounded-sm px-1 py-1.5 font-normal hover:bg-foreground/3",
      "grant-more":
        "px-1.5 pt-1.5 pb-1 font-normal text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline",
      "grant-object":
        "gap-2.5 rounded-none px-1 py-2.5 font-normal hover:bg-foreground/2",
      "grant-overview":
        "gap-3.5 rounded-none border-0 border-border not-first:border-t px-4 py-3.5 font-normal hover:bg-foreground/3",
      "onboarding-primary":
        "rounded-lg bg-white px-4 font-medium text-onboarding-ink text-sm hover:bg-white/90",
      "onboarding-secondary":
        "rounded-lg border-white/10 px-4 text-sm text-white/78 hover:bg-white/4 hover:text-white",
      "preview-toolbar": "px-1.5 text-muted-foreground",
      recovery: "px-2 py-1 text-xs",
      compact: "px-2 text-xs",
      "onboarding-command":
        "gap-3 rounded-xl border border-white/10 bg-white/4 px-4 py-3 font-mono font-normal text-white/88 text-xs transition-colors hover:bg-white/7",
      "onboarding-action":
        "rounded-lg border border-white/10 bg-white/4 px-4 font-medium text-sm text-white hover:bg-white/7",
      "onboarding-cancel":
        "rounded-lg border-white/10 px-4 text-sm text-white/68 hover:bg-white/4 hover:text-white disabled:text-white/25",
      "onboarding-finish":
        "rounded-lg bg-white px-4 font-medium text-onboarding-ink text-sm hover:bg-white/90 disabled:bg-white/18 disabled:text-white/38",
      devtools: "opacity-60 hover:opacity-100",
      "expand-cell": "rdg-expand-button text-muted-foreground",
      "onboarding-back":
        "rounded-lg border-white/10 px-4 text-sm text-white/78 hover:bg-white/4 hover:text-white disabled:text-white/30",
      "onboarding-copy":
        "rounded-lg border-white/10 px-3 text-white/68 text-xs hover:bg-white/6 hover:text-white",
      "onboarding-download":
        "rounded-lg border-white/10 px-3 text-white/78 text-xs hover:bg-white/5 hover:text-white",
      reference:
        "rounded-none p-0 font-medium text-inherit underline decoration-dotted underline-offset-2",
      ownership:
        "gap-1 rounded-full border-warning-500/30 px-2 font-normal text-warning-600 text-xs lowercase hover:bg-warning-500/10 dark:text-warning-400",
      "filter-rule": "px-0 font-mono text-xs",
      extension: "p-0 font-medium font-mono text-sm hover:bg-transparent",
      "preview-mode": "px-1.5 font-medium uppercase tracking-wide",
      privilege: "rounded-full px-2 font-mono text-xs tracking-section",
      "privilege-count":
        "gap-1 px-1.5 font-normal text-muted-foreground text-xs",
      query: "p-0 font-normal hover:bg-transparent",
      "overview-tab": "gap-1.5 rounded-none px-6 py-3 font-normal",
      "resource-row":
        "text-(length:--text-caption) @max-[14rem]/object-browser:gap-1.5 gap-2 px-2 py-0 font-normal hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:hover:bg-accent",
      "tree-row":
        "gap-2 px-2 py-0 font-normal text-muted-foreground data-[active=true]:text-foreground",
      "access-node":
        "rounded-lg border bg-background px-3 shadow-xs hover:bg-accent data-[selected=true]:border-primary data-[dimmed=true]:opacity-30 data-[selected=true]:ring-2 data-[selected=true]:ring-primary/30",
      "onboarding-method":
        "gap-3 whitespace-normal rounded-xl border border-white/10 bg-white/3 px-3.5 py-3 transition-all duration-150 hover:border-white/18 hover:bg-white/5 data-[selected=true]:border-info-400 data-[selected=true]:bg-info-500/8 data-[selected=true]:ring-1 data-[selected=true]:ring-info-400/20 data-[selected=true]:hover:border-info-400 data-[selected=true]:hover:bg-info-500/8",
      "schema-node":
        "gap-0 rounded-xl border bg-card p-0 font-normal text-foreground shadow-sm hover:bg-card data-[selected=true]:ring-2",
      "reference-cell": "p-0 font-mono text-xs",
      "access-summary-active":
        "gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60",
      "access-summary-inactive":
        "gap-3 rounded-lg border border-border/50 border-dashed px-3 py-2.5 transition-colors hover:bg-muted/60",
    },
    graphTone: {
      "chart-1": "data-[selected=true]:ring-chart-1/25",
      "chart-2": "data-[selected=true]:ring-chart-2/25",
      "chart-4": "data-[selected=true]:ring-chart-4/25",
      "chart-5": "data-[selected=true]:ring-chart-5/25",
      success: "data-[selected=true]:ring-success/25",
    },
  },
});

function Button({
  graphTone,
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseButton> &
  VariantProps<typeof buttonPresentations>) {
  return (
    <BaseButton
      className={cn(
        buttonPresentations({ presentation, graphTone }),
        className
      )}
      {...props}
    />
  );
}

export { Button };
