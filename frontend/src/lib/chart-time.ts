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

function stepToMs(step: TickStep) {
  return step.count * UNIT_MS[step.unit];
}

const DEFAULT_MAX_TICKS = 7;

const CLOCK_LABEL_MAX_SPAN_MS = 2 * MS_PER_DAY;

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

function nextLocalMidnight(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  if (date.getTime() < ms) {
    date.setDate(date.getDate() + 1);
  }

  return date.getTime();
}

function dayAlignedTicks(minMs: number, maxMs: number, stepMs: number) {
  const strideDays = Math.max(1, Math.round(stepMs / MS_PER_DAY));
  const ticks: number[] = [];
  const cursor = new Date(nextLocalMidnight(minMs));
  while (cursor.getTime() <= maxMs) {
    ticks.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + strideDays);
    cursor.setHours(0, 0, 0, 0);
  }

  return ticks;
}

function createSubdayCursor(minMs: number, unit: TickStep["unit"]) {
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

function advanceSubdayCursor(cursor: Date, unit: TickStep["unit"]) {
  if (unit === "minute") {
    cursor.setMinutes(cursor.getMinutes() + 1);
    return;
  }
  cursor.setHours(cursor.getHours() + 1);
}

function localAlignedTicks(minMs: number, maxMs: number, step: TickStep) {
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
) {
  const spanMs = maxMs - minMs;
  if (!(Number.isFinite(spanMs) && spanMs > 0 && maxTicks > 0)) {
    return [] satisfies number[];
  }

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
export function formatTimeTick(ms: number, spanMs: number) {
  if (spanMs <= CLOCK_LABEL_MAX_SPAN_MS) {
    return clockFormatter.format(new Date(ms));
  }

  return dateFormatter.format(new Date(ms));
}

/** The full, unambiguous timestamp for tooltips, e.g. "Jul 5, 14:32". */
export function formatTooltipTime(ms: number) {
  return dateTimeFormatter.format(new Date(ms));
}
