import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { TooltipTrigger } from "@/components/ui/tooltip";

const privilegePill = cva(
  "tracking-section inline-flex h-[18px] items-center justify-center gap-0.5 rounded border px-1.5 font-mono text-xs leading-none",
  {
    variants: {
      tone: {
        create:
          "border-permission-500/30 bg-permission-500/10 text-permission-700 dark:text-permission-300",
        default: "border-border bg-muted text-foreground",
        destructive:
          "border-negative-500/30 bg-negative-500/10 text-negative-700 dark:text-negative-400",
        read: "border-positive-500/30 bg-positive-500/10 text-positive-700 dark:text-positive-400",
        write:
          "border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-400",
      },
      partialTone: {
        create:
          "border-permission-500/20 bg-permission-500/5 text-permission-600/80 dark:text-permission-300/80",
        default: "border-border/70 bg-muted/50 text-muted-foreground",
        destructive:
          "border-negative-500/20 bg-negative-500/5 text-negative-600/80 dark:text-negative-400/80",
        read: "border-positive-500/20 bg-positive-500/5 text-positive-600/80 dark:text-positive-400/80",
        write:
          "border-warning-500/20 bg-warning-500/5 text-warning-600/80 dark:text-warning-400/80",
      },
      empty: {
        true: "border-border/50 text-muted-foreground/40 min-w-[2.75rem] border-dashed",
      },
      counted: { true: "min-w-[2.75rem]" },
    },
  }
);

function PrivilegePillTrigger({
  children,
  counted,
  state,
  tone,
}: {
  children: ReactNode;
  counted: boolean;
  state: "held" | "full" | "partial" | "none";
  tone: NonNullable<VariantProps<typeof privilegePill>["tone"]>;
}) {
  return (
    <TooltipTrigger
      render={
        <span
          className={privilegePill({
            counted,
            empty: state === "none",
            tone: state === "none" || state === "partial" ? undefined : tone,
            partialTone: state === "partial" ? tone : undefined,
          })}
        />
      }
    >
      {children}
    </TooltipTrigger>
  );
}

export { PrivilegePillTrigger };
