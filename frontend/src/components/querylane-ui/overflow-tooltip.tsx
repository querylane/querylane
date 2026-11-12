import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { OverflowTooltip as BaseOverflowTooltip } from "@/components/ui/overflow-tooltip";
import { cn } from "@/lib/utils";

const overflowTooltipPresentations = cva("", {
  variants: {
    presentation: {
      truncated: "truncate",
      "sidebar-detail": "truncate px-2 font-mono text-xs text-muted-foreground",
      error: "truncate font-mono text-xs text-destructive",
      identifier: "truncate font-mono text-xs",
      metric: "truncate font-mono text-xs text-foreground",
      breadcrumb: "truncate text-sm font-medium text-foreground",
      "breadcrumb-empty": "truncate text-sm font-medium text-muted-foreground",
      resource: "truncate text-sm",
      "resource-description":
        "truncate font-mono text-xs text-muted-foreground",
      "resource-hint": "truncate text-xs text-muted-foreground",
      database: "truncate font-mono text-sm font-medium text-foreground",
      "onboarding-value": "text-white/68",
    },
  },
});

function OverflowTooltip({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseOverflowTooltip> &
  VariantProps<typeof overflowTooltipPresentations>) {
  return (
    <BaseOverflowTooltip
      className={cn(overflowTooltipPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function OverflowAwareText({
  children,
  className,
  presentation,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  presentation?: VariantProps<
    typeof overflowTooltipPresentations
  >["presentation"];
  disabled?: boolean;
}) {
  const classes = cn(overflowTooltipPresentations({ presentation }), className);
  if (disabled) {
    return <span className={classes}>{children}</span>;
  }
  return (
    <BaseOverflowTooltip className={classes}>{children}</BaseOverflowTooltip>
  );
}

export { OverflowAwareText, OverflowTooltip };
