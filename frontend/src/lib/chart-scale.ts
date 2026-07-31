/**
 * Y-axis tick generation for the chart kit. Recharts' own tick generator
 * picks fractional steps (0 / 0.75 / 1.5 / 2.25) that a whole-number
 * formatter collapses into duplicate labels ("0, 1, 2, 2"), and its auto
 * domain overshoots the data (a 105% tick on a ratio). These helpers own the
 * ladder instead: every tick is a round number in the unit's own base, and
 * the domain is pinned to the top tick.
 */

/** Nice y-step mantissas per decade; the last rolls into the next decade. */
const DECIMAL_STEP_LADDER = [
  { mantissa: 1 },
  { mantissa: 2 },
  { mantissa: 5 },
  { mantissa: 10 },
];

/**
 * Step mantissas within one 1024× "decade" for byte units, so ticks land on
 * clean binary boundaries (50 KB, 100 KB, ...) instead of decimal steps that
 * a 1024-based formatter renders as "48,8 KB".
 */
const BINARY_STEP_LADDER = [
  { mantissa: 1 },
  { mantissa: 2 },
  { mantissa: 5 },
  { mantissa: 10 },
  { mantissa: 20 },
  { mantissa: 50 },
  { mantissa: 100 },
  { mantissa: 200 },
  { mantissa: 500 },
  { mantissa: 1024 },
];

const BINARY_BASE = 1024;
const DECIMAL_BASE = 10;
const STEP_PRECISION = 12;
const MAX_LADDER_CYCLES = 4;
const MAX_STEP_ADVANCES = BINARY_STEP_LADDER.length * MAX_LADDER_CYCLES;

/** How many segments the axis aims for; ticks = segments + 1 at most. */
const Y_AXIS_SEGMENTS = 4;

/**
 * The ladder rung nearest to `error` in log space — d3-array's e10/e5/e2
 * rounding rule generalized to arbitrary rungs (including the uneven binary
 * ladder, where 500 -> 1024 is not a factor of 2).
 */
function nearestRungIndex(
  ladder: { mantissa: number }[],
  error: number
): number {
  const index = ladder.findIndex((rung) => rung.mantissa >= error);
  if (index <= 0) {
    return Math.max(index, 0);
  }

  const lower = ladder[index - 1]?.mantissa ?? 1;
  const upper = ladder[index]?.mantissa ?? lower;
  return error / lower < upper / error ? index - 1 : index;
}

type ChartTickBase = typeof BINARY_BASE | typeof DECIMAL_BASE;

interface NiceAxisRangeOptions {
  formatValue: (value: number) => string;
  maxSegments: number;
  maxValue: number;
  minValue: number;
  tickBase: ChartTickBase;
}

interface LadderPosition {
  magnitude: number;
  rungIndex: number;
}

/**
 * Clean y-ticks from zero to just past `maxValue`: steps come from a
 * nice-step ladder (1-2-5 per decimal decade, or binary multiples for byte
 * units), so every tick is a round number and adjacent ticks always format to
 * distinct labels. The rung is chosen nearest in log space (d3's rounding —
 * max 45 ticks 0..50, not 0..60), then bumped while the tick budget would
 * overflow. `maxSegments` applies a strict compact budget; the default keeps
 * the established d3-like allowance of one extra segment. Null when there is
 * nothing to scale.
 */
function niceAxisTicks(
  maxValue: number,
  tickBase: ChartTickBase,
  maxSegments?: number
): number[] | null {
  if (!(Number.isFinite(maxValue) && maxValue > 0)) {
    return null;
  }

  const hasExplicitSegmentBudget =
    maxSegments !== undefined &&
    Number.isFinite(maxSegments) &&
    maxSegments > 0;
  const segmentBudget = hasExplicitSegmentBudget
    ? Math.floor(maxSegments)
    : Y_AXIS_SEGMENTS;
  const segmentLimit = hasExplicitSegmentBudget
    ? segmentBudget
    : segmentBudget + 1;
  const ladder =
    tickBase === BINARY_BASE ? BINARY_STEP_LADDER : DECIMAL_STEP_LADDER;
  const rawStep = maxValue / segmentBudget;
  const magnitude =
    tickBase ** Math.floor(Math.log(rawStep) / Math.log(tickBase));
  const error = rawStep / magnitude;
  // toPrecision guards float dust: 4.000000000000001 segments must count as
  // 4, not 5.
  const segmentsFor = (candidate: number) =>
    Math.ceil(Number((maxValue / candidate).toPrecision(STEP_PRECISION)));

  let rungIndex = nearestRungIndex(ladder, error);
  let step = (ladder[rungIndex]?.mantissa ?? 1) * magnitude;
  while (segmentsFor(step) > segmentLimit && rungIndex < ladder.length - 1) {
    rungIndex += 1;
    step = (ladder[rungIndex]?.mantissa ?? 1) * magnitude;
  }

  const count = segmentsFor(step);
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((index * step).toPrecision(STEP_PRECISION))
  );
}

function rangeTicksForStep(
  minValue: number,
  maxValue: number,
  step: number
): number[] {
  const first = Math.floor(minValue / step);
  const last = Math.ceil(maxValue / step);
  return Array.from({ length: last - first + 1 }, (_, index) =>
    Number(((first + index) * step).toPrecision(STEP_PRECISION))
  );
}

function isValidRange({
  maxSegments,
  maxValue,
  minValue,
}: NiceAxisRangeOptions): boolean {
  return (
    Number.isFinite(minValue) &&
    Number.isFinite(maxValue) &&
    maxValue > minValue &&
    Number.isFinite(maxSegments) &&
    maxSegments > 0
  );
}

function advanceLadderPosition(
  { magnitude, rungIndex }: LadderPosition,
  ladder: { mantissa: number }[],
  tickBase: ChartTickBase
): LadderPosition {
  if (rungIndex < ladder.length - 1) {
    return { magnitude, rungIndex: rungIndex + 1 };
  }

  // The final rung is the first rung of the next magnitude. Advance to its
  // second rung so the next step is genuinely larger.
  return { magnitude: magnitude * tickBase, rungIndex: 1 };
}

function hasAcceptableRangeTicks(
  ticks: number[],
  segmentBudget: number,
  formatValue: (value: number) => string
): boolean {
  const labels = ticks.map(formatValue);
  return (
    ticks.length - 1 <= segmentBudget && new Set(labels).size === labels.length
  );
}

/**
 * Clean y-ticks around a data extent instead of anchoring it to zero. Used by
 * expanded trend views where a large stable baseline would otherwise compress
 * the meaningful movement into a few pixels. The step grows until it meets
 * both the segment budget and the caller's formatter can distinguish every
 * label.
 */
function niceAxisRangeTicks(options: NiceAxisRangeOptions): number[] | null {
  if (!isValidRange(options)) {
    return null;
  }

  const { formatValue, maxSegments, maxValue, minValue, tickBase } = options;
  const segmentBudget = Math.floor(maxSegments);
  const ladder =
    tickBase === BINARY_BASE ? BINARY_STEP_LADDER : DECIMAL_STEP_LADDER;
  const rawStep = (maxValue - minValue) / segmentBudget;
  const magnitude =
    tickBase ** Math.floor(Math.log(rawStep) / Math.log(tickBase));
  const error = rawStep / magnitude;
  let position = {
    magnitude,
    rungIndex: nearestRungIndex(ladder, error),
  };

  for (let attempt = 0; attempt < MAX_STEP_ADVANCES; attempt += 1) {
    const step =
      (ladder[position.rungIndex]?.mantissa ?? 1) * position.magnitude;
    const ticks = rangeTicksForStep(minValue, maxValue, step);
    if (hasAcceptableRangeTicks(ticks, segmentBudget, formatValue)) {
      return ticks;
    }

    position = advanceLadderPosition(position, ladder, tickBase);
  }

  return null;
}

export type { ChartTickBase };
export { niceAxisRangeTicks, niceAxisTicks };
