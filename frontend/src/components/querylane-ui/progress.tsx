import {
  ProgressIndicator as ProgressPrimitiveIndicator,
  Progress as ProgressPrimitiveRoot,
} from "@ui-sdk/react/progress";
import type * as React from "react";
import { ProgressTrack as BaseProgressTrack } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ProgressVariant = "default" | "warning";

const progressIndicatorVariants: Record<ProgressVariant, string> = {
  default: "bg-primary",
  warning: "bg-warning-500",
};

function Progress({
  className,
  children,
  variant = "default",
  density = "default",
  value,
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitiveRoot>, "children"> & {
  children?: React.ReactNode;
} & {
  variant?: ProgressVariant;
  density?: "default" | "compact";
}) {
  return (
    <ProgressPrimitiveRoot
      className={cn(
        "flex flex-wrap",
        density === "compact" ? "gap-0" : "gap-3",
        className
      )}
      data-querylane-slot="progress"
      value={value ?? null}
      {...props}
    >
      {children}
      <BaseProgressTrack>
        <ProgressIndicator variant={variant} />
      </BaseProgressTrack>
    </ProgressPrimitiveRoot>
  );
}

function ProgressIndicator({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitiveIndicator> & {
  variant?: ProgressVariant;
}) {
  return (
    <ProgressPrimitiveIndicator
      className={cn(
        "h-full transition-all",
        progressIndicatorVariants[variant],
        className
      )}
      data-querylane-slot="progress-indicator"
      {...props}
    />
  );
}

export { Progress, ProgressIndicator };
