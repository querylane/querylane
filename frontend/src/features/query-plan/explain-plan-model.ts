import { isNonEmptyString, isUnknownArray } from "@/lib/value-guards";
/**
 * Turns PostgreSQL's `EXPLAIN (FORMAT JSON)` output into a tree the plan view
 * can render. Reported metadata is retained for the inspector; timing
 * attribution is approximate and disabled when execution can overlap.
 */

import { formatCount } from "@/features/sql-workbench/sql-workbench-format";

interface PlanNode {
  actualLoops?: number | undefined;
  actualRows?: number | undefined;
  /** Inclusive actual time in ms (per loop, as PostgreSQL reports it). */
  actualTotalMs?: number | undefined;
  children: PlanNode[];
  details: {
    label: string;
    value: string;
  }[];
  /** Approximate self time: inclusive work minus child work across loops. */
  exclusiveMs?: number | undefined;
  id: string;
  /** Inclusive time across all loops; not a wall-clock position. */
  inclusiveMs?: number | undefined;
  indexName?: string | undefined;
  nodeType: string;
  /** This subtree contains parallel or asynchronous execution. */
  parallel?: boolean | undefined;
  planRows?: number | undefined;
  relationName?: string | undefined;
  sharedHitBlocks?: number | undefined;
  sharedReadBlocks?: number | undefined;
  totalCost?: number | undefined;
}

interface ExplainPlan {
  executionTimeMs?: number | undefined;
  planningTimeMs?: number | undefined;
  root: PlanNode;
}

type JsonRecord = Record<string, unknown>;

const DETAIL_KEYS_TO_SKIP = new Set([
  "Actual Loops",
  "Actual Rows",
  "Actual Total Time",
  "Index Name",
  "Node Type",
  "Plan Rows",
  "Plans",
  "Relation Name",
  "Total Cost",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !isUnknownArray(value);
}

function numberField(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return isNonEmptyString(value) ? value : undefined;
}

function formatDetailValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function buildDetails(record: JsonRecord): PlanNode["details"] {
  return Object.entries(record).flatMap(([label, value]) =>
    DETAIL_KEYS_TO_SKIP.has(label)
      ? []
      : [{ label, value: formatDetailValue(value) }]
  );
}

function buildNode(record: JsonRecord, id: string): PlanNode {
  const rawChildren = record["Plans"];
  const children = isUnknownArray(rawChildren)
    ? rawChildren.flatMap((child, index) =>
        isRecord(child) ? [buildNode(child, `${id}.${index}`)] : []
      )
    : [];
  const actualLoops = numberField(record, "Actual Loops");
  const actualTotalMs = numberField(record, "Actual Total Time");
  const parallel =
    record["Parallel Aware"] === true ||
    record["Async Capable"] === true ||
    record["Node Type"] === "Gather" ||
    record["Node Type"] === "Gather Merge" ||
    (numberField(record, "Workers Planned") ?? 0) > 0 ||
    (isUnknownArray(record["Workers"]) && record["Workers"].length > 0) ||
    children.some((child) => child.parallel === true);
  let exclusiveMs: number | undefined;
  if (
    actualTotalMs !== undefined &&
    children.every(
      (child) => child.actualTotalMs !== undefined || child.actualLoops === 0
    )
  ) {
    const loops = actualLoops ?? 1;
    const inclusive = actualTotalMs * loops;
    const childTime = children.reduce(
      (sum, child) =>
        sum + (child.actualTotalMs ?? 0) * (child.actualLoops ?? 1),
      0
    );
    exclusiveMs = Math.max(0, inclusive - childTime);
  }
  return {
    actualLoops,
    actualRows: numberField(record, "Actual Rows"),
    actualTotalMs,
    children,
    details: buildDetails(record),
    exclusiveMs,
    id,
    inclusiveMs:
      actualTotalMs === undefined
        ? undefined
        : actualTotalMs * (actualLoops ?? 1),
    parallel,
    sharedHitBlocks: numberField(record, "Shared Hit Blocks"),
    sharedReadBlocks: numberField(record, "Shared Read Blocks"),
    indexName: stringField(record, "Index Name"),
    nodeType: stringField(record, "Node Type") ?? "Unknown",
    planRows: numberField(record, "Plan Rows"),
    relationName: stringField(record, "Relation Name"),
    totalCost: numberField(record, "Total Cost"),
  };
}

/** Parses the JSON text PostgreSQL returns for `EXPLAIN (FORMAT JSON)`. */
function parseExplainPlan(planJson: string): ExplainPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(planJson);
  } catch {
    return null;
  }
  const first = isUnknownArray(parsed) ? parsed[0] : parsed;
  if (!isRecord(first)) {
    return null;
  }
  const planRecord = first["Plan"];
  if (!isRecord(planRecord)) {
    return null;
  }
  const root = buildNode(planRecord, "0");
  // Worker times overlap; subtracting child totals cannot attribute self time.
  if (root.parallel === true) {
    for (const node of flattenPlan(root)) {
      node.exclusiveMs = undefined;
    }
  }
  return {
    executionTimeMs: numberField(first, "Execution Time"),
    planningTimeMs: numberField(first, "Planning Time"),
    root,
  };
}

function flattenPlan(node: PlanNode): PlanNode[] {
  return [node, ...node.children.flatMap(flattenPlan)];
}

type PlanMetric = "self" | "time" | "rows" | "buffers" | "cost";

function planMetricValue(
  node: PlanNode,
  metric: PlanMetric
): number | undefined {
  switch (metric) {
    case "self":
      return node.exclusiveMs;
    case "time":
      return node.inclusiveMs;
    case "rows":
      return node.actualRows ?? node.planRows;
    case "buffers":
      return node.sharedHitBlocks === undefined &&
        node.sharedReadBlocks === undefined
        ? undefined
        : (node.sharedHitBlocks ?? 0) + (node.sharedReadBlocks ?? 0);
    case "cost":
      return node.totalCost;
    default:
      return metric satisfies never;
  }
}

function planNodeTitle(node: PlanNode): string {
  return (
    node.nodeType +
    (isNonEmptyString(node.relationName) ? ` on ${node.relationName}` : "") +
    (isNonEmptyString(node.indexName) ? ` using ${node.indexName}` : "")
  );
}

const ROW_ESTIMATE_THRESHOLD = 10;
const HEAVY_FILTER_MIN_ROWS = 1000;
const HEAVY_FILTER_RATIO = 0.9;
const PERCENT = 100;

function rowEstimateLabel(
  actual: number,
  estimated: number
): string | undefined {
  if (actual === estimated) {
    return;
  }
  if (actual === 0) {
    return estimated >= ROW_ESTIMATE_THRESHOLD ? "No rows returned" : undefined;
  }
  if (estimated === 0) {
    return actual >= ROW_ESTIMATE_THRESHOLD
      ? "Rows not anticipated"
      : undefined;
  }
  const ratio = actual / estimated;
  if (ratio >= ROW_ESTIMATE_THRESHOLD) {
    return `${formatCount(Math.round(ratio))}× more rows`;
  }
  if (ratio <= 1 / ROW_ESTIMATE_THRESHOLD) {
    return `${formatCount(Math.round(1 / ratio))}× fewer rows`;
  }
  return undefined;
}

interface PlanInsight {
  detail: string;
  label: string;
}

function rowEstimateInsights(node: PlanNode): PlanInsight[] {
  const { actualRows: actual, planRows: estimated } = node;
  // Both counts are per execution, not totals across loops.
  if (
    node.nodeType !== "BitmapAnd" &&
    node.nodeType !== "BitmapOr" &&
    actual !== undefined &&
    estimated !== undefined
  ) {
    const label = rowEstimateLabel(actual, estimated);
    if (isNonEmptyString(label)) {
      return [
        {
          label,
          detail: `${formatCount(actual)} actual / ${formatCount(estimated)} estimated per loop. Check statistics and predicates.`,
        },
      ];
    }
  }
  return [];
}

function filterInsights(node: PlanNode): PlanInsight[] {
  const removed = Number(
    node.details.find((detail) => detail.label === "Rows Removed by Filter")
      ?.value ?? 0
  );
  const inspected = removed + (node.actualRows ?? 0);
  if (
    node.actualRows !== undefined &&
    removed >= HEAVY_FILTER_MIN_ROWS &&
    removed / inspected >= HEAVY_FILTER_RATIO
  ) {
    return [
      {
        label: `${((PERCENT * removed) / inspected).toFixed(1)}% filtered`,
        detail: `${formatCount(removed)} rows removed per loop. Inspect the filter and scan conditions.`,
      },
    ];
  }
  return [];
}

function planNodeInsights(node: PlanNode): PlanInsight[] {
  if (node.actualLoops === 0) {
    return [];
  }
  const insights: PlanInsight[] = [];
  const diskSort = node.details.some(
    (detail) => detail.label === "Sort Space Type" && detail.value === "Disk"
  );
  const batchedHash = node.details.some(
    (detail) => detail.label === "Hash Batches" && Number(detail.value) > 1
  );
  if (diskSort || batchedHash) {
    insights.push({
      label: diskSort ? "Sort spilled to disk" : "Hash used multiple batches",
      detail: diskSort
        ? "The sort exceeded its available memory. Inspect sort space and temporary blocks below."
        : "The hash table used multiple batches. Inspect memory usage and temporary blocks below.",
    });
  }
  return [...rowEstimateInsights(node), ...insights, ...filterInsights(node)];
}

export type { ExplainPlan, PlanMetric, PlanNode };
export {
  flattenPlan,
  parseExplainPlan,
  planMetricValue,
  planNodeInsights,
  planNodeTitle,
};
