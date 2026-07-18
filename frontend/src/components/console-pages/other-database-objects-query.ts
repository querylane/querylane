import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  OtherDatabaseObject,
  OtherObjectCategory,
} from "@/components/console-pages/database-object-categories";
import {
  BROWSE_PAGE_SIZE,
  buildCronJobsSummaryStatement,
  buildOtherObjectsBrowseStatement,
  buildOtherObjectsSummaryStatement,
  HAS_CRON_JOBS_SQL,
} from "@/components/console-pages/other-database-objects-sql";
import { buildDatabaseName } from "@/lib/console-resources";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { SQLService } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import type {
  TableResultRow,
  TableValue,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const SUMMARY_ROW_LIMIT = 100;
const EXECUTE_BATCH_SIZE = 100;

interface OtherObjectsCategorySummary {
  objects: OtherDatabaseObject[];
  total: number;
}

type OtherObjectsSummary = Partial<
  Record<OtherObjectCategory, OtherObjectsCategorySummary>
>;

interface OtherObjectsBrowsePage {
  hasMore: boolean;
  objects: OtherDatabaseObject[];
}

type QueryRow = Record<string, string>;
type OtherObjectsRowExecutor = (input: {
  parent: string;
  rowLimit: number;
  statement: string;
}) => Promise<QueryRow[]>;

function tableValueToText(value: TableValue | undefined): string {
  const kind = value?.kind;
  if (!kind || kind.case === undefined || kind.case === "nullValue") {
    return "";
  }
  switch (kind.case) {
    case "boolValue":
      return kind.value ? "true" : "false";
    case "bytesValue":
      return "";
    case "doubleValue":
      return String(kind.value);
    case "int64Value":
      return kind.value.toString();
    case "jsonValue":
      return kind.value;
    case "numericValue":
      return kind.value;
    case "stringValue":
      return kind.value;
    case "timestampValue":
      return kind.value;
    default:
      return assertNeverTableValueKind(kind);
  }
}

function assertNeverTableValueKind(_kind: never): never {
  throw new Error("Unexpected table value kind");
}

function rowToRecord(columns: string[], row: TableResultRow): QueryRow {
  const record: QueryRow = {};
  row.values.forEach((cell, index) => {
    const column = columns[index];
    if (!column) {
      return;
    }
    record[column] = tableValueToText(cell.value);
  });
  return record;
}

async function executeRows({
  parent,
  rowLimit,
  statement,
  transport,
}: {
  parent: string;
  rowLimit: number;
  statement: string;
  transport: Transport;
}): Promise<QueryRow[]> {
  const client = createClient(SQLService, transport);
  const rows: QueryRow[] = [];
  let columns: string[] = [];

  for await (const response of client.executeQuery({
    batchSize: EXECUTE_BATCH_SIZE,
    parent,
    rowLimit,
    statement,
  })) {
    const { result } = response;
    if (result.case === undefined) {
      continue;
    }
    switch (result.case) {
      case "columnMetadata":
        columns = result.value.columns.map((column) => column.columnName);
        break;
      case "rowBatch":
        rows.push(...result.value.rows.map((row) => rowToRecord(columns, row)));
        break;
      case "stats":
        break;
      default:
        assertNeverExecuteResult(result);
    }
  }

  return rows;
}

function assertNeverExecuteResult(_result: never): never {
  throw new Error("Unexpected execute query result");
}

function queryRowToObject(row: QueryRow): OtherDatabaseObject | null {
  const { category } = row;
  if (!isOtherDatabaseObjectCategory(category)) {
    return null;
  }

  return {
    badge: row["badge"] ?? "",
    category,
    detail: row["detail"] ?? "",
    name: row["name"] ?? "",
    sortKey: row["sort_key"] ?? row["name"] ?? "",
    status: parseObjectStatus(row["status"]),
    summary: row["summary"] ?? "",
  };
}

function parseObjectStatus(status: string | undefined) {
  switch (status) {
    case "failed":
    case "ok":
    case "warning":
      return status;
    case "":
    case undefined:
      return;
    default:
      return "warning";
  }
}

function isOtherDatabaseObjectCategory(
  category: string | undefined
): category is OtherObjectCategory {
  return (
    category === "routines" ||
    category === "sequences" ||
    category === "types" ||
    category === "collations" ||
    category === "fdwServers" ||
    category === "replication" ||
    category === "eventTriggers" ||
    category === "cronJobs"
  );
}

function mergeSummaryRows(summary: OtherObjectsSummary, rows: QueryRow[]) {
  for (const row of rows) {
    const object = queryRowToObject(row);
    if (!object) {
      continue;
    }
    const total = Number(row["category_total"] ?? "0");
    const entry = summary[object.category] ?? { objects: [], total };
    entry.objects.push(object);
    entry.total = Number.isFinite(total) ? total : entry.objects.length;
    summary[object.category] = entry;
  }
}

async function hasCronJobsTable({
  execute,
  parent,
}: {
  execute: OtherObjectsRowExecutor;
  parent: string;
}): Promise<boolean> {
  const rows = await execute({
    parent,
    rowLimit: 1,
    statement: HAS_CRON_JOBS_SQL,
  });
  return rows[0]?.["has_cron_job_table"] === "true";
}

/**
 * Overview payload: the top rows per category plus exact totals. Never fetches
 * beyond a handful of rows regardless of how many objects exist server-side.
 */
async function fetchOtherDatabaseObjectsSummary({
  execute,
  parent,
}: {
  execute: OtherObjectsRowExecutor;
  parent: string;
}): Promise<OtherObjectsSummary> {
  // The cron probe (and, when present, the cron summary) runs alongside the
  // combined summary statement instead of serially after it.
  const [summaryRows, cronRows] = await Promise.all([
    execute({
      parent,
      rowLimit: SUMMARY_ROW_LIMIT,
      statement: buildOtherObjectsSummaryStatement(),
    }),
    fetchCronJobsSummaryRows({ execute, parent }),
  ]);
  const summary: OtherObjectsSummary = {};
  mergeSummaryRows(summary, summaryRows);
  mergeSummaryRows(summary, cronRows);
  return summary;
}

async function fetchCronJobsSummaryRows({
  execute,
  parent,
}: {
  execute: OtherObjectsRowExecutor;
  parent: string;
}): Promise<QueryRow[]> {
  if (!(await hasCronJobsTable({ execute, parent }))) {
    return [];
  }
  return execute({
    parent,
    rowLimit: SUMMARY_ROW_LIMIT,
    statement: buildCronJobsSummaryStatement(),
  });
}

/** One search-filtered, keyset-paginated page of a single category. */
async function fetchOtherObjectsBrowsePage({
  afterSortKey,
  category,
  cronJobsAvailable,
  execute,
  parent,
  search,
}: {
  afterSortKey?: string | undefined;
  category: OtherObjectCategory;
  cronJobsAvailable?: boolean | undefined;
  execute: OtherObjectsRowExecutor;
  parent: string;
  search?: string | undefined;
}): Promise<OtherObjectsBrowsePage> {
  if (
    category === "cronJobs" &&
    !(cronJobsAvailable ?? (await hasCronJobsTable({ execute, parent })))
  ) {
    return { hasMore: false, objects: [] };
  }
  const rows = await execute({
    parent,
    rowLimit: BROWSE_PAGE_SIZE + 1,
    statement: buildOtherObjectsBrowseStatement({
      afterSortKey,
      category,
      search,
    }),
  });
  return {
    hasMore: rows.length > BROWSE_PAGE_SIZE,
    objects: rows
      .slice(0, BROWSE_PAGE_SIZE)
      .map(queryRowToObject)
      .filter((object): object is OtherDatabaseObject => object !== null),
  };
}

interface DatabaseScopeInput {
  databaseId: string;
  instanceId: string;
}

function useRowExecutor(): OtherObjectsRowExecutor {
  const transport = useTransport();
  return ({ parent, rowLimit, statement }) =>
    executeRows({ parent, rowLimit, statement, transport });
}

function useOtherDatabaseObjectsSummaryQuery({
  databaseId,
  instanceId,
}: DatabaseScopeInput) {
  const execute = useRowExecutor();
  const parent = buildDatabaseName(instanceId, databaseId);

  return useQuery({
    enabled: Boolean(databaseId && instanceId),
    queryFn: () => fetchOtherDatabaseObjectsSummary({ execute, parent }),
    queryKey: ["console", "database", "other-objects", parent] as const,
    ...RESOURCE_QUERY_OPTIONS.schemaList,
  });
}

function useOtherObjectsBrowseQuery({
  category,
  databaseId,
  instanceId,
  search,
}: DatabaseScopeInput & {
  category: OtherObjectCategory;
  search: string;
}) {
  const execute = useRowExecutor();
  const parent = buildDatabaseName(instanceId, databaseId);
  const enabled = Boolean(databaseId && instanceId);

  // Whether `cron.job` exists is fixed for the lifetime of a database
  // connection, so probe it once per database here instead of before every
  // page fetch and search change. On probe errors the page fetch falls back
  // to probing itself so the failure still surfaces through the browse query.
  const cronProbe = useQuery({
    enabled: enabled && category === "cronJobs",
    queryFn: () => hasCronJobsTable({ execute, parent }),
    queryKey: ["console", "database", "has-cron-jobs", parent] as const,
    ...RESOURCE_QUERY_OPTIONS.schemaList,
  });
  const cronProbeSettled =
    category !== "cronJobs" ||
    cronProbe.data !== undefined ||
    cronProbe.isError;

  return useInfiniteQuery({
    enabled: enabled && cronProbeSettled,
    getNextPageParam: (lastPage: OtherObjectsBrowsePage) =>
      lastPage.hasMore ? (lastPage.objects.at(-1)?.sortKey ?? null) : null,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      fetchOtherObjectsBrowsePage({
        afterSortKey: pageParam || undefined,
        category,
        cronJobsAvailable: cronProbe.data,
        execute,
        parent,
        search: search || undefined,
      }),
    queryKey: [
      "console",
      "database",
      "other-objects-browse",
      parent,
      category,
      search,
    ] as const,
    ...RESOURCE_QUERY_OPTIONS.schemaList,
  });
}

export type { OtherObjectsBrowsePage, OtherObjectsSummary };
export {
  fetchOtherDatabaseObjectsSummary,
  fetchOtherObjectsBrowsePage,
  queryRowToObject,
  rowToRecord,
  tableValueToText,
  useOtherDatabaseObjectsSummaryQuery,
  useOtherObjectsBrowseQuery,
};
