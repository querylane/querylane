import type { Duration } from "@bufbuild/protobuf/wkt";
import { assertNever } from "@/lib/assert-never";
import type {
  ExecuteQueryResponse,
  QueryStats,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import type {
  TableCell,
  TableResultColumn,
  TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const CLIENT_READ_ONLY_STARTS = new Set(["SELECT", "WITH", "VALUES", "SHOW"]);
const FIRST_SQL_TOKEN_PATTERN = /^[a-z_]+/i;
const SELECT_INTO_PATTERN = /\bINTO\b/i;
const SELECT_LOCKING_CLAUSE_PATTERN =
  /\bFOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE|KEY\s+SHARE)\b/i;
const MILLISECONDS_PER_SECOND = 1000;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const WHOLE_MILLISECONDS_THRESHOLD = 100;
const SMALL_DURATION_THRESHOLD = 10;
const MILLISECOND_PRECISION_FACTOR = 1_000_000;
const EXPLAIN_NODE_PATTERN =
  /^(\s*)(?:->\s*)?(.+?)\s+\(cost=[\d.]+\.\.[\d.]+\s+rows=(\d+)\s+width=\d+\)(?:\s+\(actual time=[\d.]+\.\.([\d.]+)\s+rows=(\d+)\s+loops=(\d+)\))?/;
const PLANNING_TIME_PATTERN = /^Planning Time:\s+([\d.]+)\s+ms$/;
const EXECUTION_TIME_PATTERN = /^Execution Time:\s+([\d.]+)\s+ms$/;
const BUFFER_VALUE_PATTERN = /\b(hit|read)=(\d+)\b/g;

interface WorkbenchIds {
  databaseId: string;
  instanceId: string;
}

interface ExecuteQueryTableState {
  columns: TableResultColumn[];
  notices: string[];
  rows: TableResultRow[];
  stats: QueryStats | null;
}

interface ExplainPlanNode {
  actualRows: number | null;
  actualTimeMs: number | null;
  depth: number;
  estimatedRows: number;
  exclusiveTimeMs: number | null;
  id: number;
  label: string;
  loops: number | null;
}

interface ExplainPlanSummary {
  executionTimeMs: number | null;
  nodes: ExplainPlanNode[];
  planningTimeMs: number | null;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
}

function buildWorkbenchParent({
  databaseId,
  instanceId,
}: WorkbenchIds): string {
  return `instances/${instanceId}/databases/${databaseId}`;
}

function firstSqlToken(statement: string): string {
  return (
    stripLeadingSqlTrivia(statement)
      .match(FIRST_SQL_TOKEN_PATTERN)?.[0]
      .toUpperCase() ?? ""
  );
}

function stripLeadingSqlTrivia(statement: string): string {
  let remaining = statement.trimStart();
  while (remaining.startsWith("--") || remaining.startsWith("/*")) {
    if (remaining.startsWith("--")) {
      const lineEnd = remaining.indexOf("\n");
      remaining = lineEnd < 0 ? "" : remaining.slice(lineEnd + 1).trimStart();
      continue;
    }

    const commentEnd = remaining.indexOf("*/", 2);
    remaining =
      commentEnd < 0 ? "" : remaining.slice(commentEnd + 2).trimStart();
  }
  return remaining;
}

function isReadOnlyStatementCandidate(statement: string): boolean {
  const trimmed = statement.trim();
  if (!trimmed) {
    return false;
  }
  const withoutTrailingSemicolon = trimmed.endsWith(";")
    ? trimmed.slice(0, -1)
    : trimmed;
  if (withoutTrailingSemicolon.includes(";")) {
    return false;
  }
  if (
    SELECT_INTO_PATTERN.test(withoutTrailingSemicolon) ||
    SELECT_LOCKING_CLAUSE_PATTERN.test(withoutTrailingSemicolon)
  ) {
    return false;
  }
  return CLIENT_READ_ONLY_STARTS.has(firstSqlToken(trimmed));
}

function durationToMs(duration: Duration): number {
  return (
    Number(duration.seconds) * MILLISECONDS_PER_SECOND +
    duration.nanos / NANOSECONDS_PER_MILLISECOND
  );
}

function formatDurationMs(duration: Duration | undefined): string {
  if (!duration) {
    return "—";
  }

  const ms = durationToMs(duration);
  if (ms >= WHOLE_MILLISECONDS_THRESHOLD) {
    return `${Math.round(ms).toLocaleString()} ms`;
  }
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: ms < SMALL_DURATION_THRESHOLD ? 2 : 1,
  }).format(ms)} ms`;
}

async function collectExecuteQueryStream(
  stream: AsyncIterable<ExecuteQueryResponse>
): Promise<ExecuteQueryTableState> {
  const state: ExecuteQueryTableState = {
    columns: [],
    notices: [],
    rows: [],
    stats: null,
  };

  for await (const message of stream) {
    switch (message.result.case) {
      case "columnMetadata":
        state.columns = message.result.value.columns;
        break;
      case "rowBatch":
        state.rows.push(...message.result.value.rows);
        break;
      case "stats":
        state.stats = message.result.value;
        state.notices = message.result.value.notices;
        break;
      case undefined:
        break;
      default:
        assertNever(message.result);
    }
  }

  return state;
}

function formatCellValue(cell: TableCell | undefined): string {
  const kind = cell?.value?.kind;
  switch (kind?.case) {
    case "boolValue":
      return kind.value ? "true" : "false";
    case "bytesValue":
      return `[${kind.value.length.toLocaleString()} bytes]`;
    case "doubleValue":
      return String(kind.value);
    case "int64Value":
      return kind.value.toLocaleString();
    case "jsonValue":
    case "numericValue":
    case "stringValue":
    case "timestampValue":
      return kind.value;
    case "nullValue":
    case undefined:
      return "NULL";
    default:
      return assertNever(kind);
  }
}

function planDuration(line: string, pattern: RegExp): number | null {
  const value = line.match(pattern)?.[1];
  return value ? Number(value) : null;
}

function parsePlanNode(line: string, id: number): ExplainPlanNode | null {
  const match = line.match(EXPLAIN_NODE_PATTERN);
  if (!(match?.[2] && match[3])) {
    return null;
  }
  return {
    actualRows: match[5] ? Number(match[5]) : null,
    actualTimeMs: match[4] ? Number(match[4]) : null,
    depth: Math.floor((match[1]?.length ?? 0) / 2),
    estimatedRows: Number(match[3]),
    exclusiveTimeMs: match[4] ? Number(match[4]) : null,
    id,
    label: match[2].trim(),
    loops: match[6] ? Number(match[6]) : null,
  };
}

function deriveExclusiveNodeTimes(nodes: ExplainPlanNode[]) {
  const ancestors: ExplainPlanNode[] = [];
  for (const node of nodes) {
    while (
      ancestors.length > 0 &&
      (ancestors.at(-1)?.depth ?? 0) >= node.depth
    ) {
      ancestors.pop();
    }
    const parent = ancestors.at(-1);
    if (
      parent?.exclusiveTimeMs !== null &&
      parent?.exclusiveTimeMs !== undefined &&
      node.actualTimeMs !== null
    ) {
      parent.exclusiveTimeMs = Math.max(
        0,
        Math.round(
          (parent.exclusiveTimeMs - node.actualTimeMs) *
            MILLISECOND_PRECISION_FACTOR
        ) / MILLISECOND_PRECISION_FACTOR
      );
    }
    ancestors.push(node);
  }
}

function parseTopLevelBuffers(line: string): {
  sharedHitBlocks: number;
  sharedReadBlocks: number;
} | null {
  if (!line.startsWith("Buffers:")) {
    return null;
  }
  let sharedHitBlocks = 0;
  let sharedReadBlocks = 0;
  for (const match of line.matchAll(BUFFER_VALUE_PATTERN)) {
    const value = Number(match[2]);
    if (match[1] === "hit") {
      sharedHitBlocks = value;
    } else if (match[1] === "read") {
      sharedReadBlocks = value;
    }
  }
  return { sharedHitBlocks, sharedReadBlocks };
}

function parseExplainTextPlan(plan: string): ExplainPlanSummary {
  const nodes: ExplainPlanNode[] = [];
  let planningTimeMs: number | null = null;
  let executionTimeMs: number | null = null;
  let buffers: ReturnType<typeof parseTopLevelBuffers> = null;

  for (const line of plan.split("\n")) {
    const trimmed = line.trim();
    planningTimeMs ??= planDuration(trimmed, PLANNING_TIME_PATTERN);
    executionTimeMs ??= planDuration(trimmed, EXECUTION_TIME_PATTERN);
    buffers ??= parseTopLevelBuffers(trimmed);
    const node = parsePlanNode(line, nodes.length + 1);
    if (node) {
      nodes.push(node);
    }
  }
  deriveExclusiveNodeTimes(nodes);

  return {
    executionTimeMs,
    nodes,
    planningTimeMs,
    sharedHitBlocks: buffers?.sharedHitBlocks ?? 0,
    sharedReadBlocks: buffers?.sharedReadBlocks ?? 0,
  };
}

export type {
  ExecuteQueryTableState,
  ExplainPlanNode,
  ExplainPlanSummary,
  WorkbenchIds,
};
export {
  buildWorkbenchParent,
  collectExecuteQueryStream,
  formatCellValue,
  formatDurationMs,
  isReadOnlyStatementCandidate,
  parseExplainTextPlan,
};
