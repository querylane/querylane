import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Button as BaseButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const buttonPresentations = cva("", {
  variants: {
    presentation: {
      "plan-map-node":
        "border-border bg-card hover:bg-accent aria-pressed:border-chart-4 aria-pressed:ring-chart-4/15 h-auto flex-col items-stretch justify-start gap-0 overflow-hidden rounded-lg border p-0 text-left font-normal whitespace-normal shadow-sm aria-pressed:ring-2",
      "plan-work":
        "h-6 w-full justify-start gap-2 rounded-sm p-0 hover:bg-transparent",
      warning: "text-warning-600 hover:text-warning-700",
      quiet: "text-muted-foreground hover:text-foreground",
      "sidebar-action":
        "border-border bg-background text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground gap-2 px-2.5 font-normal shadow-none",
      "compact-group": "gap-2 rounded-sm px-1.5 py-1",
      clear: "text-muted-foreground hover:text-foreground p-0",
      micro: "px-1.5 text-xs",
      "tree-disclosure":
        "text-muted-foreground hover:text-foreground aria-expanded:text-muted-foreground aria-expanded:hover:text-foreground gap-2 px-2 py-0 font-normal hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent",
      unpadded: "p-0",
      muted: "text-muted-foreground",
      "icon-label": "gap-2",
      segmented: "rounded-none border-0",
      "grant-group":
        "hover:bg-foreground/3 gap-2 rounded-sm px-1.5 py-1 font-normal",
      "grant-count": "text-muted-foreground px-2 text-xs font-normal",
      "grant-entity":
        "hover:bg-foreground/3 gap-3 rounded-sm px-1 py-1.5 font-normal",
      "grant-more":
        "text-muted-foreground hover:text-foreground px-1.5 pt-1.5 pb-1 text-xs font-normal underline-offset-2 hover:underline",
      "grant-object":
        "hover:bg-foreground/2 gap-2.5 rounded-none px-1 py-2.5 font-normal",
      "grant-overview":
        "border-border hover:bg-foreground/3 gap-3.5 rounded-none border-0 px-4 py-3.5 font-normal not-first:border-t",
      "onboarding-primary":
        "text-onboarding-ink rounded-lg bg-white px-4 text-sm font-medium hover:bg-white/90",
      "onboarding-secondary":
        "rounded-lg border-white/10 px-4 text-sm text-white/78 hover:bg-white/4 hover:text-white",
      "preview-toolbar": "text-muted-foreground px-1.5",
      recovery: "px-2 py-1 text-xs",
      compact: "px-2 text-xs",
      "onboarding-command":
        "gap-3 rounded-xl border border-white/10 bg-white/4 px-4 py-3 font-mono text-xs font-normal text-white/88 transition-colors hover:bg-white/7",
      "onboarding-action":
        "rounded-lg border border-white/10 bg-white/4 px-4 text-sm font-medium text-white hover:bg-white/7",
      "onboarding-cancel":
        "rounded-lg border-white/10 px-4 text-sm text-white/68 hover:bg-white/4 hover:text-white disabled:text-white/25",
      "onboarding-finish":
        "text-onboarding-ink rounded-lg bg-white px-4 text-sm font-medium hover:bg-white/90 disabled:bg-white/18 disabled:text-white/38",
      devtools: "opacity-60 hover:opacity-100",
      "expand-cell": "rdg-expand-button text-muted-foreground",
      "onboarding-back":
        "rounded-lg border-white/10 px-4 text-sm text-white/78 hover:bg-white/4 hover:text-white disabled:text-white/30",
      "onboarding-copy":
        "rounded-lg border-white/10 px-3 text-xs text-white/68 hover:bg-white/6 hover:text-white",
      "onboarding-download":
        "rounded-lg border-white/10 px-3 text-xs text-white/78 hover:bg-white/5 hover:text-white",
      reference:
        "rounded-none p-0 font-medium text-inherit underline decoration-dotted underline-offset-2",
      ownership:
        "border-warning-500/30 text-warning-600 hover:bg-warning-500/10 dark:text-warning-400 gap-1 rounded-full px-2 text-xs font-normal lowercase",
      "filter-rule": "px-0 font-mono text-xs",
      extension: "p-0 font-mono text-sm font-medium hover:bg-transparent",
      "preview-mode": "px-1.5 font-medium tracking-wide uppercase",
      privilege: "tracking-section rounded-full px-2 font-mono text-xs",
      "privilege-count":
        "text-muted-foreground gap-1 px-1.5 text-xs font-normal",
      query: "p-0 font-normal hover:bg-transparent",
      "overview-tab": "gap-1.5 rounded-none px-6 py-3 font-normal",
      "resource-row":
        "hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:hover:bg-accent gap-2 px-2 py-0 font-normal text-(length:--text-caption) @max-[14rem]/object-browser:gap-1.5",
      "tree-row":
        "text-muted-foreground data-[active=true]:text-foreground gap-2 px-2 py-0 font-normal",
      "access-node":
        "bg-background hover:bg-accent data-[selected=true]:border-primary data-[selected=true]:ring-primary/30 rounded-lg border px-3 shadow-xs data-[dimmed=true]:opacity-30 data-[selected=true]:ring-2",
      "onboarding-method":
        "data-[selected=true]:border-info-400 data-[selected=true]:bg-info-500/8 data-[selected=true]:ring-info-400/20 data-[selected=true]:hover:border-info-400 data-[selected=true]:hover:bg-info-500/8 gap-3 rounded-xl border border-white/10 bg-white/3 px-3.5 py-3 whitespace-normal transition-all duration-150 hover:border-white/18 hover:bg-white/5 data-[selected=true]:ring-1",
      "schema-node":
        "bg-card text-foreground hover:bg-card gap-0 rounded-xl border p-0 font-normal shadow-sm data-[selected=true]:ring-2",
      "reference-cell": "p-0 font-mono text-xs",
      "access-summary-active":
        "border-border bg-muted/30 hover:bg-muted/60 gap-3 rounded-lg border px-3 py-2.5 transition-colors",
      "sql-tab":
        "text-muted-foreground hover:text-foreground aria-selected:text-foreground gap-1.5 rounded-none py-1.5 pr-1 pl-3 text-xs hover:bg-transparent focus-visible:ring-inset aria-selected:font-medium",
      "sql-tab-close":
        "text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-[active=true]:opacity-100",
      "sql-list-row": "gap-1 rounded-md px-3 py-2",
      "sql-plan-node": "px-0 py-1.5 font-normal hover:bg-transparent",
      // A filled button that leads a ButtonGroup: registry buttons carry a
      // transparent 1px border with a padding-box background, so at the
      // join the page shows through as a white line. Drop that edge.
      "group-lead": "border-r-0",
      "sql-relation-row":
        "hover:bg-accent/60 gap-2 px-1.5 py-0 font-normal text-(length:--text-caption)",
      "sql-row-delete":
        "text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
      "access-summary-inactive":
        "border-border/50 hover:bg-muted/60 gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors",
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
