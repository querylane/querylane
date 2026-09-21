import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { OverflowTooltip as BaseOverflowTooltip } from "@/components/ui/overflow-tooltip";
import { cn } from "@/lib/utils";

const overflowTooltipPresentations = cva("", {
  variants: {
    presentation: {
      truncated: "truncate",
      "sidebar-detail": "truncate px-2 font-mono text-muted-foreground text-xs",
      error: "truncate font-mono text-destructive text-xs",
      identifier: "truncate font-mono text-xs",
      metric: "truncate font-mono text-foreground text-xs",
      breadcrumb: "truncate font-medium text-foreground text-sm",
      "breadcrumb-empty": "truncate font-medium text-muted-foreground text-sm",
      resource: "truncate text-sm",
      "resource-description":
        "truncate font-mono text-muted-foreground text-xs",
      "resource-hint": "truncate text-muted-foreground text-xs",
      database: "truncate font-medium font-mono text-foreground text-sm",
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
