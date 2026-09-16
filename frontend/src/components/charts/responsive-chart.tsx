import type { ChartValue } from "@tanstack/charts";
import { Chart, type ChartDefinition } from "@tanstack/charts/react";

interface ResponsiveChartProps<
  Datum,
  HorizontalValue extends ChartValue,
  VerticalValue extends ChartValue,
> {
  ariaLabel: string;
  definition: ChartDefinition<Datum, HorizontalValue, VerticalValue>;
  initialWidth: number;
}

/**
 * Lets TanStack observe both dimensions of Querylane's CSS-sized chart slots.
 * The parent must constrain the height independently of the chart surface.
 */
function ResponsiveChart<
  Datum,
  HorizontalValue extends ChartValue,
  VerticalValue extends ChartValue,
>({
  ariaLabel,
  definition,
  initialWidth,
}: ResponsiveChartProps<Datum, HorizontalValue, VerticalValue>) {
  return (
    <Chart
      ariaLabel={ariaLabel}
      className="size-full min-h-0 min-w-0"
      definition={definition}
      initialWidth={initialWidth}
      // Clear the adapter's inline 320px fallback so Tailwind owns the height.
      style={{ height: undefined }}
    />
  );
}

export { ResponsiveChart };
