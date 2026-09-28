// Six one-minute samples with a gap, shared by chart behavior tests and the
// Playwright visual harness.
const MINUTE_MS = 60_000;
const START_MS = Date.parse("2026-08-23T12:00:00Z");

const SAMPLES = [
  { previous: 9, requests: 12 },
  { previous: 12, requests: 18 },
  { previous: 10, requests: 15 },
  { previous: 15, requests: null },
  { previous: 14, requests: 22 },
  { previous: 16, requests: 24 },
];

const METRIC_CHART_SAMPLE_DATA = SAMPLES.map((sample, index) => ({
  ...sample,
  time: START_MS + index * MINUTE_MS,
}));

// Both series share one color: the current window renders solid and the
// previous window renders dashed.
const CHART_COLOR = "var(--color-chart-1)";
const CHART_LINE_SELECTOR = `path[stroke="${CHART_COLOR}"]`;
const CURRENT_LINE_SELECTOR = `${CHART_LINE_SELECTOR}[stroke-width="2"]`;
const PREVIOUS_LINE_SELECTOR = `${CHART_LINE_SELECTOR}[stroke-dasharray="4 4"]`;

export {
  CURRENT_LINE_SELECTOR,
  METRIC_CHART_SAMPLE_DATA,
  PREVIOUS_LINE_SELECTOR,
};
