import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { OverflowTooltip as BaseOverflowTooltip } from "@/components/ui/overflow-tooltip";
import { cn } from "@/lib/utils";

const overflowTooltipPresentations = cva("", {
  variants: {
    presentation: {
      truncated: "truncate",
      "sidebar-detail": "text-muted-foreground truncate px-2 font-mono text-xs",
      error: "text-destructive truncate font-mono text-xs",
      identifier: "truncate font-mono text-xs",
      metric: "text-foreground truncate font-mono text-xs",
      breadcrumb: "text-foreground truncate text-sm font-medium",
      "breadcrumb-empty": "text-muted-foreground truncate text-sm font-medium",
      resource: "truncate text-sm",
      "resource-description":
        "text-muted-foreground truncate font-mono text-xs",
      "resource-hint": "text-muted-foreground truncate text-xs",
      database: "text-foreground truncate font-mono text-sm font-medium",
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
