import { Maximize2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { MetricChart } from "@/components/charts/metric-chart";
import { useIsMobile } from "@/components/querylane-ui/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ExpandableMetricChartProps = ComponentProps<typeof MetricChart> & {
  preview?: ReactNode;
  title: string;
  triggerClassName?: string | undefined;
};

/**
 * Turns a chart or compact trend preview into an accessible dialog trigger.
 * The dialog reuses the same data and formatting at near-viewport size.
 */
function ExpandableMetricChart({
  preview,
  title,
  triggerClassName,
  ...chartProps
}: ExpandableMetricChartProps) {
  const isMobile = useIsMobile();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            aria-label={`Expand ${title}`}
            className={cn(
              "items-stretch gap-0 overflow-hidden p-0",
              triggerClassName
            )}
            type="button"
            variant="ghost"
          >
            <span
              className="h-full min-w-0 flex-1 overflow-hidden [&_svg]:max-w-full"
              data-slot="expand-chart-preview"
            >
              {preview ?? (
                <MetricChart {...chartProps} accessibilityLayer={false} />
              )}
            </span>
            <Maximize2
              aria-hidden="true"
              className="mx-1 mt-2 size-3.5 self-start text-muted-foreground"
              data-slot="expand-chart-icon"
            />
          </Button>
        }
      />
      <DialogContent className="!flex !max-w-none sm:!max-w-[calc(100vw-2rem)] h-dvh max-h-dvh w-full flex-col gap-2 overflow-hidden rounded-none p-2 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:gap-3 sm:rounded-xl sm:p-4 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2 sm:[&_[data-slot=dialog-close]]:top-4 sm:[&_[data-slot=dialog-close]]:right-4">
        <DialogHeader className="min-h-8 shrink-0 justify-center pr-10 sm:min-h-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <MetricChart {...chartProps} compact={isMobile} yAxisScale="data" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ExpandableMetricChart };
