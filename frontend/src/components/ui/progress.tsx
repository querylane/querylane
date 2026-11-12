import {
  ProgressIndicator as ProgressPrimitiveIndicator,
  ProgressLabel as ProgressPrimitiveLabel,
  Progress as ProgressPrimitiveRoot,
  ProgressTrack as ProgressPrimitiveTrack,
  ProgressValue as ProgressPrimitiveValue,
} from "@ui-sdk/react/progress";
import { cn } from "cn";
import type * as React from "react";

function Progress({
  className,
  children,
  value,
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitiveRoot>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <ProgressPrimitiveRoot
      className={cn("flex flex-wrap gap-3", className)}
      data-querylane-slot="progress"
      value={value ?? null}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitiveRoot>
  );
}

function ProgressTrack({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitiveTrack>) {
  return (
    <ProgressPrimitiveTrack
      className={cn(
        "relative flex h-1.5 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-querylane-slot="progress-track"
      {...props}
    />
  );
}

function ProgressIndicator({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitiveIndicator>) {
  return (
    <ProgressPrimitiveIndicator
      className={cn("h-full bg-primary transition-all", className)}
      data-querylane-slot="progress-indicator"
      {...props}
    />
  );
}

function ProgressLabel({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitiveLabel>) {
  return (
    <ProgressPrimitiveLabel
      className={cn("text-sm font-medium", className)}
      data-querylane-slot="progress-label"
      {...props}
    />
  );
}

function ProgressValue({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitiveValue>) {
  return (
    <ProgressPrimitiveValue
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-querylane-slot="progress-value"
      {...props}
    />
  );
}

export {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
};
