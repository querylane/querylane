import type { ReactNode } from "react";
import { useId } from "react";
import { Card } from "@/components/querylane-ui/card";
import { cn } from "@/lib/utils";

const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 32;
/** Where a flat (zero-span) series draws: centered in the sparkline box. */
const SPARKLINE_FLAT_POSITION = 0.5;
const MIN_SPARKLINE_POINTS = 2;
/** Vertical viewBox inset so the stroke never clips at the cell edges. */
const SPARKLINE_INSET = 3;

function sparklinePath(values: number[]): string {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  const stepX = SPARKLINE_WIDTH / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = index * stepX;
      const normalized =
        span === 0 ? SPARKLINE_FLAT_POSITION : (value - minimum) / span;
      const y =
        SPARKLINE_HEIGHT -
        normalized * (SPARKLINE_HEIGHT - 2 * SPARKLINE_INSET) -
        SPARKLINE_INSET;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function TrendSparkline({ values }: { values: number[] }) {
  const gradientId = useId();
  if (values.length < MIN_SPARKLINE_POINTS) {
    return null;
  }
  const path = sparklinePath(values);
  return (
    <svg
      aria-hidden="true"
      className="size-full text-chart-1 opacity-60"
      fill="none"
      preserveAspectRatio="none"
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.14} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT} L0,${SPARKLINE_HEIGHT} Z`}
        fill={`url(#${gradientId})`}
      />
      {/* The viewBox stretches non-uniformly to the cell; without this the
          stroke scales too, so steep segments render thicker than flat ones. */}
      <path
        d={path}
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Below md the strip is a 2×2 grid: separate the rows with a border on the
// first two cells and the columns with a border on odd cells.
const CELL_BORDERS =
  "border-border max-md:odd:border-r max-md:nth-[-n+2]:border-b";

/** A full-width row of headline stats: label, value, caption, trend band. */
function StatStrip({ children }: { children: ReactNode }) {
  return (
    <Card
      className="grid grid-cols-2 overflow-hidden md:grid-cols-4"
      presentation="split"
    >
      {children}
    </Card>
  );
}

function StatCell({
  label,
  notice,
  sparklineValues: sparkline,
  sub,
  value,
}: {
  label: string;
  /** A warning shown in place of the caption, e.g. a failed metric probe. */
  notice?: ReactNode | undefined;
  sparklineValues?: number[] | undefined;
  sub?: ReactNode | undefined;
  value: ReactNode;
}) {
  const hasSparkline =
    sparkline !== undefined && sparkline.length >= MIN_SPARKLINE_POINTS;
  return (
    <div
      className={cn(
        "relative flex min-h-24 flex-col px-5 pt-4 pb-8",
        CELL_BORDERS
      )}
    >
      {hasSparkline ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-7 opacity-70"
        >
          <TrendSparkline values={sparkline} />
        </div>
      ) : null}
      <div className="relative flex flex-col gap-1.5">
        <span className="text-(length:--text-label-sm) font-medium text-muted-foreground uppercase tracking-heading">
          {label}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-(length:--text-heading-sm) font-mono font-semibold text-foreground tabular-nums leading-none tracking-tight">
            {value}
          </span>
          {notice ? (
            <span className="mt-1 text-warning-600 text-xs leading-snug dark:text-warning-400">
              {notice}
            </span>
          ) : null}
          {!notice && sub ? (
            <span className="mt-1 text-muted-foreground text-xs">{sub}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { StatCell, StatStrip };
