import { formatDialect, postgresql } from "sql-formatter";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_WITH_TWO_DECIMALS = 10;
const PLAN_MS_WITH_TWO_DECIMALS = 10;
const PLAN_MS_ZERO_THRESHOLD = 0.01;
const DEFAULT_SUMMARY_LENGTH = 120;

function formatRowCount(count: number): string {
  return `${NUMBER_FORMAT.format(count)} ${count === 1 ? "row" : "rows"}`;
}

function formatCount(count: number): string {
  return NUMBER_FORMAT.format(count);
}

function formatDurationMs(ms: number): string {
  if (ms < 1) {
    return "<1 ms";
  }
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)} ms`;
  }
  const seconds = ms / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds.toFixed(seconds < SECONDS_WITH_TWO_DECIMALS ? 2 : 1)} s`;
  }
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = Math.round(seconds - minutes * SECONDS_PER_MINUTE);
  return `${minutes}m ${remainder}s`;
}

function formatPlanMs(ms: number): string {
  if (ms < PLAN_MS_ZERO_THRESHOLD) {
    return "0.00 ms";
  }
  if (ms < PLAN_MS_WITH_TWO_DECIMALS) {
    return `${ms.toFixed(2)} ms`;
  }
  return formatDurationMs(ms);
}

/** Pretty-prints SQL with PostgreSQL rules; returns the input when parsing fails. */
function formatSqlText(text: string): { ok: boolean; text: string } {
  try {
    return {
      ok: true,
      text: formatDialect(text, {
        dataTypeCase: "upper",
        dialect: postgresql,
        functionCase: "lower",
        keywordCase: "upper",
        linesBetweenQueries: 2,
      }),
    };
  } catch {
    return { ok: false, text };
  }
}

/** One-line preview for history and saved-query lists. */
function summarizeStatement(
  statement: string,
  maxLength = DEFAULT_SUMMARY_LENGTH
): string {
  const collapsed = statement
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1)}…`
    : collapsed;
}

export {
  formatCount,
  formatDurationMs,
  formatPlanMs,
  formatRowCount,
  formatSqlText,
  summarizeStatement,
};
