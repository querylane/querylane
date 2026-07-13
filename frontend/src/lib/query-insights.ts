import type { QueryRuntimeInsight } from "@/protogen/querylane/console/v1alpha1/database_pb";

const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_RATIO_MULTIPLIER = 100;

export function formatInsightInteger(value: bigint | number) {
  return value.toLocaleString();
}

export function formatInsightMs(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }
  if (value >= MILLISECONDS_PER_SECOND) {
    return `${(value / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
  }
  if (value >= 10) {
    return `${Math.round(value).toLocaleString()} ms`;
  }
  return `${value.toFixed(1)} ms`;
}

export function formatInsightPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }
  return `${Math.round(value * PERCENT_RATIO_MULTIPLIER).toLocaleString()}%`;
}

export function formatQualifiedTable(schemaName: string, tableName: string) {
  return `${schemaName}.${tableName}`;
}

export function insightProgressValue(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }
  return Math.min(ratio * PERCENT_RATIO_MULTIPLIER, PERCENT_RATIO_MULTIPLIER);
}

export function queryInsightLabel(query: QueryRuntimeInsight) {
  const queryText = query.query.trim();
  if (queryText) {
    return queryText;
  }
  if (query.queryId !== 0n) {
    return `Query ID ${query.queryId.toString()}`;
  }
  return "Query text unavailable";
}
