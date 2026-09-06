import type { ChartValue } from "@tanstack/charts";
import { Chart, type ChartDefinition } from "@tanstack/charts/react";
import { useEffect, useRef, useState } from "react";

interface ResponsiveChartProps<
  Datum,
  HorizontalValue extends ChartValue,
  VerticalValue extends ChartValue,
> {
  ariaLabel: string;
  definition: ChartDefinition<Datum, HorizontalValue, VerticalValue>;
  initialHeight: number;
  initialWidth: number;
}

/**
 * Adapts TanStack Charts' width-responsive host to Querylane's parent-sized
 * chart slots, which can be anything from a 48 px sparkline to a 288 px panel.
 */
function ResponsiveChart<
  Datum,
  HorizontalValue extends ChartValue,
  VerticalValue extends ChartValue,
>({
  ariaLabel,
  definition,
  initialHeight,
  initialWidth,
}: ResponsiveChartProps<Datum, HorizontalValue, VerticalValue>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(initialHeight);

  useEffect(function observeChartHeight() {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    function updateHeight(nextHeight: number) {
      if (!(Number.isFinite(nextHeight) && nextHeight > 0)) {
        return;
      }
      setHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight
      );
    }

    updateHeight(container.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (entry) {
        updateHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="size-full min-h-0 min-w-0" ref={containerRef}>
      <Chart
        ariaLabel={ariaLabel}
        className="size-full"
        definition={definition}
        height={height}
        initialWidth={initialWidth}
      />
    </div>
  );
}

export { ResponsiveChart };
