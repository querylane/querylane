/**
 * Turns PostgreSQL's `EXPLAIN (FORMAT JSON)` output into a tree the plan view
 * can render. Only the fields the view shows are extracted; the raw node is
 * kept for the "details" disclosure.
 */

interface PlanNode {
  actualLoops?: number | undefined;
  actualRows?: number | undefined;
  /** Inclusive actual time in ms (per loop, as PostgreSQL reports it). */
  actualTotalMs?: number | undefined;
  children: PlanNode[];
  details: Array<{ label: string; value: string }>;
  /** Exclusive time in ms: this node minus its children, times loops. */
  exclusiveMs?: number | undefined;
  id: string;
  indexName?: string | undefined;
  nodeType: string;
  parallelAware: boolean;
  planRows?: number | undefined;
  relationName?: string | undefined;
  /** Share of summed derived self work, not execution wall time. */
  share?: number | undefined;
  sharedHitBlocks?: number | undefined;
  sharedReadBlocks?: number | undefined;
  tempWrittenBlocks?: number | undefined;
  totalCost?: number | undefined;
  workersPlanned?: number | undefined;
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
  "Actual Startup Time",
  "Actual Total Time",
  "Index Name",
  "Node Type",
  "Plan Rows",
  "Plans",
  "Relation Name",
  "Total Cost",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
  const children = Array.isArray(rawChildren)
    ? rawChildren.flatMap((child, index) =>
        isRecord(child) ? [buildNode(child, `${id}.${index}`)] : []
      )
    : [];
  const actualLoops = numberField(record, "Actual Loops");
  const actualTotalMs = numberField(record, "Actual Total Time");
  let exclusiveMs: number | undefined;
  if (actualTotalMs !== undefined) {
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
    sharedHitBlocks: numberField(record, "Shared Hit Blocks"),
    sharedReadBlocks: numberField(record, "Shared Read Blocks"),
    tempWrittenBlocks: numberField(record, "Temp Written Blocks"),
    parallelAware: record["Parallel Aware"] === true,
    workersPlanned: numberField(record, "Workers Planned"),
    indexName: stringField(record, "Index Name"),
    nodeType: stringField(record, "Node Type") ?? "Unknown",
    planRows: numberField(record, "Plan Rows"),
    relationName: stringField(record, "Relation Name"),
    share: undefined,
    totalCost: numberField(record, "Total Cost"),
  };
}

function assignShares(node: PlanNode, total: number) {
  if (total > 0 && node.exclusiveMs !== undefined) {
    node.share = node.exclusiveMs / total;
  }
  for (const child of node.children) {
    assignShares(child, total);
  }
}

function sumExclusive(node: PlanNode): number {
  return (
    (node.exclusiveMs ?? 0) +
    node.children.reduce((sum, child) => sum + sumExclusive(child), 0)
  );
}

/** Parses the JSON text PostgreSQL returns for `EXPLAIN (FORMAT JSON)`. */
function parseExplainPlan(planJson: string): ExplainPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(planJson);
  } catch {
    return null;
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isRecord(first)) {
    return null;
  }
  const planRecord = first["Plan"];
  if (!isRecord(planRecord)) {
    return null;
  }
  const root = buildNode(planRecord, "0");
  assignShares(root, sumExclusive(root));
  return {
    executionTimeMs: numberField(first, "Execution Time"),
    planningTimeMs: numberField(first, "Planning Time"),
    root,
  };
}

function flattenPlan(node: PlanNode): PlanNode[] {
  return [node, ...node.children.flatMap(flattenPlan)];
}

/** Row estimates and actual rows are both per invocation, not total loop rows. */
function estimateMismatch(node: PlanNode): string | undefined {
  const threshold = 10;
  const actual = node.actualRows;
  const estimated = node.planRows;
  if (
    actual === undefined ||
    estimated === undefined ||
    node.actualLoops === 0
  ) {
    return undefined;
  }
  if (actual === 0 && estimated >= threshold) {
    return `No rows; estimated ${estimated.toLocaleString("en-US")}`;
  }
  if (estimated === 0 && actual > 0) {
    return "Rows returned; estimated none";
  }
  if (actual === 0 || estimated === 0) {
    return undefined;
  }
  const ratio = actual / estimated;
  if (ratio >= threshold) {
    return `${Math.round(ratio)}× more than estimated`;
  }
  if (ratio <= 1 / threshold) {
    return `${Math.round(1 / ratio)}× fewer than estimated`;
  }
  return undefined;
}

function nodeTitle(node: PlanNode): string {
  return [
    node.nodeType,
    node.relationName ? `on ${node.relationName}` : "",
    node.indexName ? `using ${node.indexName}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeExplainPlan(plan: ExplainPlan) {
  const nodes = flattenPlan(plan.root);
  const slowestNode = nodes.reduce<PlanNode | undefined>(
    (slowest, node) =>
      (node.exclusiveMs ?? 0) > (slowest?.exclusiveMs ?? 0) ? node : slowest,
    undefined
  );
  const hits = plan.root.sharedHitBlocks;
  const reads = plan.root.sharedReadBlocks;
  return {
    nodes,
    slowestNode,
    estimateMismatches: nodes.flatMap((node) => {
      const label = estimateMismatch(node);
      return label ? [{ node, label }] : [];
    }),
    // Upper-level buffer counters include their descendants. Never sum nodes.
    sharedBuffers:
      hits === undefined || reads === undefined ? undefined : { hits, reads },
    hasParallelWork: nodes.some(
      (node) => node.parallelAware || (node.workersPlanned ?? 0) > 0
    ),
    tempWrittenBlocks: plan.root.tempWrittenBlocks,
  };
}

export type { ExplainPlan, PlanNode };
export {
  estimateMismatch,
  flattenPlan,
  nodeTitle,
  parseExplainPlan,
  summarizeExplainPlan,
};
