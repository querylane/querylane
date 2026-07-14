/**
 * Time-axis helpers for the chart kit: calendar-aligned "nice" tick generation
 * and range-adaptive label formatting. Recharts' numeric tick generator picks
 * multiples of powers of ten, which are ugly as times (e.g. 13:47, 15:23);
 * these helpers snap ticks to whole minutes/hours/days instead, the way d3's
 * time scales do, without pulling in d3 directly.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const UNIT_MS = {
  day: MS_PER_DAY,
  hour: MS_PER_HOUR,
  minute: MS_PER_MINUTE,
} as const;

interface TickStep {
  count: number;
  unit: keyof typeof UNIT_MS;
}

/** Candidate tick intervals, smallest first: whole minutes, hours, then days. */
const TICK_STEPS: TickStep[] = [
  { count: 1, unit: "minute" },
  { count: 2, unit: "minute" },
  { count: 5, unit: "minute" },
  { count: 10, unit: "minute" },
  { count: 15, unit: "minute" },
  { count: 30, unit: "minute" },
  { count: 1, unit: "hour" },
  { count: 2, unit: "hour" },
  { count: 3, unit: "hour" },
  { count: 6, unit: "hour" },
  { count: 12, unit: "hour" },
  { count: 1, unit: "day" },
  { count: 2, unit: "day" },
  { count: 7, unit: "day" },
];

function stepToMs(step: TickStep): number {
  return step.count * UNIT_MS[step.unit];
}

/** Default upper bound on generated ticks; tuned for card-width charts. */
const DEFAULT_MAX_TICKS = 7;

/** Spans at or below this render tick labels as clock times, above as dates. */
const CLOCK_LABEL_MAX_SPAN_MS = 2 * MS_PER_DAY;

/**
 * One pinned locale + 24h clock for every chart label, matching the pinned
 * en-US number formatters in lib/metrics.ts. A floating locale renders
 * "48,8 KB/s" next to "1.2K" on the same screen, and en-US's default 12-hour
 * cycle turns axis ticks into "02:30 PM" — triple-width labels that violate
 * the monitoring convention (Grafana always renders HH:mm).
 */
const CHART_LOCALE = "en-US";

const clockFormatter = new Intl.DateTimeFormat(CHART_LOCALE, {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(CHART_LOCALE, {
  day: "numeric",
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat(CHART_LOCALE, {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
});

/** The local midnight at or after `ms` (DST-safe via Date arithmetic). */
function nextLocalMidnight(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  if (date.getTime() < ms) {
    date.setDate(date.getDate() + 1);
  }

  return date.getTime();
}

function dayAlignedTicks(
  minMs: number,
  maxMs: number,
  stepMs: number
): number[] {
  const strideDays = Math.max(1, Math.round(stepMs / MS_PER_DAY));
  const ticks: number[] = [];
  const cursor = new Date(nextLocalMidnight(minMs));
  while (cursor.getTime() <= maxMs) {
    ticks.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + strideDays);
    // Re-floor after each stride: when DST removes midnight (e.g. Santiago's
    // spring-forward at 24:00), setDate normalizes to 01:00 and would
    // otherwise stay there for every following day.
    cursor.setHours(0, 0, 0, 0);
  }

  return ticks;
}

function createSubdayCursor(minMs: number, unit: TickStep["unit"]): Date {
  const cursor = new Date(minMs);
  if (unit === "minute") {
    cursor.setSeconds(0, 0);
    if (cursor.getTime() < minMs) {
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
    return cursor;
  }
  cursor.setMinutes(0, 0, 0);
  if (cursor.getTime() < minMs) {
    cursor.setHours(cursor.getHours() + 1);
  }
  return cursor;
}

function advanceSubdayCursor(cursor: Date, unit: TickStep["unit"]): void {
  if (unit === "minute") {
    cursor.setMinutes(cursor.getMinutes() + 1);
    return;
  }
  cursor.setHours(cursor.getHours() + 1);
}

/**
 * Sub-day ticks aligned to the LOCAL calendar: walk whole local minutes or
 * hours and keep multiples of the step (d3-time's filter semantics). Epoch
 * multiples would label ":45" in offset timezones like Asia/Kathmandu
 * (+05:45) and jump 3 hours across DST transitions; wall-clock fields don't.
 */
function localAlignedTicks(
  minMs: number,
  maxMs: number,
  step: TickStep
): number[] {
  const cursor = createSubdayCursor(minMs, step.unit);

  const ticks: number[] = [];
  while (cursor.getTime() <= maxMs) {
    const field =
      step.unit === "minute" ? cursor.getMinutes() : cursor.getHours();
    if (field % step.count === 0) {
      ticks.push(cursor.getTime());
    }
    advanceSubdayCursor(cursor, step.unit);
  }

  return ticks;
}

/**
 * Calendar-aligned tick positions for a `[minMs, maxMs]` time domain: the
 * smallest step from the ladder that yields at most `maxTicks` ticks. Sub-day
 * steps align to whole local minutes/hours; day steps align to local
 * midnights so date labels never sit mid-day.
 */
export function buildTimeTicks(
  minMs: number,
  maxMs: number,
  maxTicks: number = DEFAULT_MAX_TICKS
): number[] {
  const spanMs = maxMs - minMs;
  if (!(Number.isFinite(spanMs) && spanMs > 0 && maxTicks > 0)) {
    return [];
  }

  // A grid-aligned window fits floor(span/step) + 1 ticks, so the budget
  // check must use maxTicks - 1 segments, not maxTicks.
  const fittingStep = TICK_STEPS.find(
    (step) => spanMs / stepToMs(step) <= maxTicks - 1
  );

  if (!fittingStep) {
    return dayAlignedTicks(minMs, maxMs, Math.ceil(spanMs / maxTicks));
  }
  if (fittingStep.unit === "day") {
    return dayAlignedTicks(minMs, maxMs, stepToMs(fittingStep));
  }

  return localAlignedTicks(minMs, maxMs, fittingStep);
}

/**
 * One label format per chart, chosen by the domain span — never per tick — so
 * every label on an axis reads uniformly: clock times ("14:30") for intraday
 * spans, dates ("Jul 3") beyond two days.
 */
export function formatTimeTick(ms: number, spanMs: number): string {
  if (spanMs <= CLOCK_LABEL_MAX_SPAN_MS) {
    return clockFormatter.format(new Date(ms));
  }

  return dateFormatter.format(new Date(ms));
}

/** The full, unambiguous timestamp for tooltips, e.g. "Jul 5, 14:32". */
export function formatTooltipTime(ms: number): string {
  return dateTimeFormatter.format(new Date(ms));
}
