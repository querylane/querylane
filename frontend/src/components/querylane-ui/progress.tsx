import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { ProgressTrack as BaseProgressTrack } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ProgressVariant = "default" | "warning";

const progressIndicatorVariants: Record<ProgressVariant, string> = {
  default: "bg-primary",
  warning: "bg-amber-500",
};

function Progress({
  className,
  children,
  variant = "default",
  value,
  ...props
}: ProgressPrimitive.Root.Props & { variant?: ProgressVariant }) {
  return (
    <ProgressPrimitive.Root
      className={cn("flex flex-wrap gap-3", className)}
      data-slot="progress"
      value={value}
      {...props}
    >
      {children}
      <BaseProgressTrack>
        <ProgressIndicator variant={variant} />
      </BaseProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressIndicator({
  className,
  variant = "default",
  ...props
}: ProgressPrimitive.Indicator.Props & { variant?: ProgressVariant }) {
  return (
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full transition-all",
        progressIndicatorVariants[variant],
        className
      )}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

export { Progress, ProgressIndicator };
