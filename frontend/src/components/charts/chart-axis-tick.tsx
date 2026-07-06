import { usePlotArea } from "recharts";

/**
 * How close (px) a tick must sit to the plot edge before its label anchors
 * inward instead of centering.
 */
const EDGE_PX = 14;

/** Default Recharts baseline offset so digits hang below the tick point. */
const BASELINE_DY = "0.71em";

/** Lifts inset y-labels to sit just above their gridline. */
const INSET_LABEL_LIFT_PX = 6;

interface InsetValueTickProps {
  formatter: (value: number) => string;
  // Recharts injects the geometry when rendering the tick element.
  payload?: { value: number };
  x?: number;
  y?: number;
}

interface EdgeAwareTimeTickProps {
  formatter: (value: number) => string;
  // Recharts injects the geometry when rendering the tick element.
  payload?: { value: number };
  x?: number;
  y?: number;
}

/**
 * A y-axis tick label for inset mode, drawn INSIDE the plot just above its
 * gridline. A plain SVG text never word-wraps — Recharts' default tick wraps
 * labels like "50 KB/s" onto two lines when the mirrored axis reports a
 * 1px width. Legibility over data comes from the surface halo painted by
 * the `[data-y-inset]` rule in index.css.
 */
export function InsetValueTick({
  formatter,
  payload,
  x = 0,
  y = 0,
}: InsetValueTickProps) {
  if (payload === undefined) {
    return null;
  }

  return (
    <text
      className="recharts-cartesian-axis-tick-value"
      fill="var(--color-muted-foreground)"
      textAnchor="end"
      x={x}
      y={y - INSET_LABEL_LIFT_PX}
    >
      {formatter(payload.value)}
    </text>
  );
}

/**
 * An x-axis tick label that anchors inward at the plot edges: Recharts
 * centers every label on its tick, so a first/last tick near the domain edge
 * hangs half a label outside the plot and clips against the card. The first
 * label anchors "start", the last "end" (the d3 axis convention), everything
 * between stays centered.
 */
export function EdgeAwareTimeTick({
  formatter,
  payload,
  x = 0,
  y = 0,
}: EdgeAwareTimeTickProps) {
  const plot = usePlotArea();
  if (payload === undefined || plot === undefined) {
    return null;
  }

  let textAnchor: "end" | "middle" | "start" = "middle";
  if (x <= plot.x + EDGE_PX) {
    textAnchor = "start";
  } else if (x >= plot.x + plot.width - EDGE_PX) {
    textAnchor = "end";
  }

  return (
    <text
      className="recharts-cartesian-axis-tick-value"
      dy={BASELINE_DY}
      fill="var(--color-muted-foreground)"
      textAnchor={textAnchor}
      x={x}
      y={y}
    >
      {formatter(payload.value)}
    </text>
  );
}
