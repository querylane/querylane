"use client";

import { anyUnpack } from "@bufbuild/protobuf/wkt";
import {
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  X,
} from "lucide-react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { ResourcePageState } from "@/components/console-pages/console-layout";
import { EmptyState } from "@/components/empty-state";
import { Progress } from "@/components/querylane-ui/progress";
import { WarningBadge } from "@/components/querylane-ui/warning-badge";
import { RetryActionButton } from "@/components/retry-action-button";
import { SelectValue } from "@/components/select-extensions";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTableFilter } from "@/components/ui/data-table";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useGetDatabaseQuery,
  useGetDatabaseQueryInsightsQuery,
} from "@/hooks/api/database";
import { buildDatabaseName, formatBytes } from "@/lib/console-resources";
import {
  formatInsightInteger,
  formatInsightMs,
  formatInsightPercent,
  formatQualifiedTable,
  insightProgressValue,
  queryInsightLabel,
} from "@/lib/query-insights";
import { createResourceLoader } from "@/lib/resource-loader";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type {
  DatabaseQueryInsights,
  QueryRuntimeInsight,
  SequentialScanHotspot,
  TableCacheHitInsight,
} from "@/protogen/querylane/console/v1alpha1/database_pb";

const CACHE_HIT_WARNING_THRESHOLD = 0.9;
const QUERY_PAGE_SIZE_5 = 5;
const QUERY_PAGE_SIZE_10 = 10;
const QUERY_PAGE_SIZE_25 = 25;
const QUERY_PAGE_SIZE_50 = 50;
const QUERY_PAGE_SIZE_100 = 100;
const QUERY_PAGE_SIZE_DEFAULT = QUERY_PAGE_SIZE_5;
const QUERY_PAGE_SIZE_OPTIONS = [
  QUERY_PAGE_SIZE_5,
  QUERY_PAGE_SIZE_10,
  QUERY_PAGE_SIZE_25,
  QUERY_PAGE_SIZE_50,
  QUERY_PAGE_SIZE_100,
] as const;

type QueryPageSize = (typeof QUERY_PAGE_SIZE_OPTIONS)[number];
type QueryKindFilter = "all" | "reads" | "writes";

const QUERY_KIND_FILTER_OPTIONS = [
  { label: "Read queries", value: "reads" },
  { label: "Write queries", value: "writes" },
] satisfies { label: string; value: Exclude<QueryKindFilter, "all"> }[];
const LEADING_EXPLAIN_RE = /^EXPLAIN\b\s*(?:\([^)]*\)\s*)?/i;
const LEADING_EXPLAIN_FLAG_RE = /^(?:(?:ANALYZE|VERBOSE)\b\s*)+/i;
const WITH_QUERY_RE = /^WITH\b/i;
const READ_QUERY_RE = /^(?:SELECT|SHOW|TABLE|VALUES)\b/i;
const WRITE_QUERY_RE =
  /^(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO)\b/i;
const WRITE_QUERY_KEYWORD_RE =
  /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO)\b/i;
const LEADING_SQL_COMMENT_RE =
  /^(?:(?:\/\*[\s\S]*?\*\/)|(?:--[^\r\n]*(?:\r?\n|$)))\s*/;
const COPY_KEYWORD_RE = /^COPY\b/i;
const DOLLAR_QUOTE_DELIMITER_RE = /^\$[A-Za-z_0-9]*\$/;
const SQL_WORD_START_RE = /[A-Za-z_]/;
const SQL_WORD_RE = /^[A-Za-z_][A-Za-z_0-9$]*/;
type MeanFilterValue = "any" | "5" | "10" | "30";

const MEAN_FILTER_OPTIONS = [
  { label: "Mean > 5 ms", threshold: 5, value: "5" },
  { label: "Mean > 10 ms", threshold: 10, value: "10" },
  { label: "Mean > 30 ms", threshold: 30, value: "30" },
] satisfies {
  label: string;
  threshold: number;
  value: Exclude<MeanFilterValue, "any">;
}[];
type QueryClassification = "read" | "write" | "other";
type QueryInsightMetric = "query_stats" | "table_stats";
type QueryInsightPartialErrors = Partial<Record<QueryInsightMetric, Status>>;

interface IndexedQueryRuntimeInsight {
  index: number;
  query: QueryRuntimeInsight;
  selectionKey: string;
}

interface QuerySelection {
  selectionKey: string;
  snapshotSource: QueryRuntimeInsight[] | null;
}

function queryKindFromSelectedValues(values: string[]): QueryKindFilter {
  const value = values.at(-1);
  switch (value) {
    case "reads":
    case "writes":
      return value;
    default:
      return "all";
  }
}

function meanFilterFromSelectedValues(values: string[]): MeanFilterValue {
  switch (values.at(-1)) {
    case "5":
      return "5";
    case "10":
      return "10";
    case "30":
      return "30";
    default:
      return "any";
  }
}

function meanFilterThreshold(value: MeanFilterValue) {
  if (value === "any") {
    return 0;
  }
  return (
    MEAN_FILTER_OPTIONS.find((filter) => filter.value === value)?.threshold ?? 0
  );
}

function queryPageCount(totalRows: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

function queryPageSizeFromValue(value: string): QueryPageSize | null {
  const pageSize = Number.parseInt(value, 10);
  return QUERY_PAGE_SIZE_OPTIONS.find((option) => option === pageSize) ?? null;
}

function queryPaginationRange({
  pageIndex,
  pageSize,
  totalRows,
}: {
  pageIndex: number;
  pageSize: number;
  totalRows: number;
}) {
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalRows);
  return { end, start };
}

function getQueryInsightPartialErrors(partialErrors: Status[]) {
  const errors: QueryInsightPartialErrors = {};
  for (const partialError of partialErrors) {
    for (const detail of partialError.details) {
      let errorInfo: ReturnType<typeof anyUnpack<typeof ErrorInfoSchema>>;
      try {
        errorInfo = anyUnpack(detail, ErrorInfoSchema);
      } catch {
        errorInfo = undefined;
      }
      const metric = errorInfo?.metadata["metric"];
      if (metric === "query_stats" || metric === "table_stats") {
        errors[metric] = partialError;
      }
    }
  }
  return errors;
}

function stripLeadingExplain(queryText: string) {
  return queryText
    .replace(LEADING_EXPLAIN_RE, "")
    .trimStart()
    .replace(LEADING_EXPLAIN_FLAG_RE, "")
    .trimStart();
}

function stripLeadingSqlComments(queryText: string) {
  let statement = queryText.trimStart();
  let previousStatement: string;
  do {
    previousStatement = statement;
    statement = statement.replace(LEADING_SQL_COMMENT_RE, "").trimStart();
  } while (statement !== previousStatement);
  return statement;
}

function skipQuotedSql(statement: string, index: number, quote: string) {
  let nextIndex = index + 1;
  while (nextIndex < statement.length) {
    if (statement[nextIndex] !== quote) {
      nextIndex += 1;
      continue;
    }
    if (statement[nextIndex + 1] === quote) {
      nextIndex += 2;
      continue;
    }
    return nextIndex + 1;
  }
  return statement.length;
}

function skipSqlComment(statement: string, index: number) {
  const character = statement[index];
  const nextCharacter = statement[index + 1];
  if (character === "-" && nextCharacter === "-") {
    const newlineIndex = statement.indexOf("\n", index + 2);
    return newlineIndex < 0 ? statement.length : newlineIndex + 1;
  }
  if (character === "/" && nextCharacter === "*") {
    const commentEndIndex = statement.indexOf("*/", index + 2);
    return commentEndIndex < 0 ? statement.length : commentEndIndex + 2;
  }
  return null;
}

function skipProtectedSql(statement: string, index: number) {
  const character = statement[index];
  if (character === "'" || character === '"') {
    return skipQuotedSql(statement, index, character);
  }
  if (character === "$") {
    const delimiter = DOLLAR_QUOTE_DELIMITER_RE.exec(
      statement.slice(index)
    )?.[0];
    if (delimiter) {
      const closingIndex = statement.indexOf(
        delimiter,
        index + delimiter.length
      );
      return closingIndex < 0
        ? statement.length
        : closingIndex + delimiter.length;
    }
  }
  return skipSqlComment(statement, index);
}

function updateParenthesesDepth(character: string | undefined, depth: number) {
  if (character === "(") {
    return depth + 1;
  }
  if (character === ")") {
    return Math.max(0, depth - 1);
  }
  return depth;
}

function copyDirection(statement: string): "from" | "to" | null {
  const copyKeyword = COPY_KEYWORD_RE.exec(statement);
  if (!copyKeyword) {
    return null;
  }

  let parenthesesDepth = 0;
  let index = copyKeyword[0].length;
  while (index < statement.length) {
    const protectedSqlEnd = skipProtectedSql(statement, index);
    if (protectedSqlEnd !== null) {
      index = protectedSqlEnd;
      continue;
    }

    const character = statement[index];
    parenthesesDepth = updateParenthesesDepth(character, parenthesesDepth);
    const wordMatch =
      parenthesesDepth === 0 && character && SQL_WORD_START_RE.test(character)
        ? SQL_WORD_RE.exec(statement.slice(index))
        : null;
    if (!wordMatch) {
      index += 1;
      continue;
    }

    const word = wordMatch[0].toLowerCase();
    const previousNonSpace = statement.slice(0, index).trimEnd().at(-1);
    if (previousNonSpace !== "." && (word === "from" || word === "to")) {
      return word;
    }
    index += wordMatch[0].length;
  }

  return null;
}

function classifyQuery(query: QueryRuntimeInsight): QueryClassification {
  const queryText = query.query.trim();
  if (!queryText) {
    return "other";
  }

  // Best effort from pg_stat_statements text until the backend returns a statement kind.
  const statement = stripLeadingSqlComments(
    stripLeadingExplain(stripLeadingSqlComments(queryText))
  );
  const direction = copyDirection(statement);
  if (direction) {
    return direction === "to" ? "read" : "write";
  }
  if (WITH_QUERY_RE.test(statement)) {
    return WRITE_QUERY_KEYWORD_RE.test(statement) ? "write" : "read";
  }
  if (WRITE_QUERY_RE.test(statement)) {
    return "write";
  }
  if (READ_QUERY_RE.test(statement)) {
    return "read";
  }

  return "other";
}

function queryMatchesKind(query: QueryRuntimeInsight, filter: QueryKindFilter) {
  switch (filter) {
    case "all":
      return true;
    case "reads":
      return classifyQuery(query) === "read";
    case "writes":
      return classifyQuery(query) === "write";
    default:
      return filter satisfies never;
  }
}

function indexQueries(queries: QueryRuntimeInsight[]) {
  const queryIdCounts = new Map<bigint, number>();
  for (const query of queries) {
    queryIdCounts.set(
      query.queryId,
      (queryIdCounts.get(query.queryId) ?? 0) + 1
    );
  }

  return queries.map((query, index) => {
    const selectionKey =
      query.queryId !== 0n && queryIdCounts.get(query.queryId) === 1
        ? `queryid:${query.queryId.toString()}`
        : [
            "snapshot",
            index.toString(),
            query.queryId.toString(),
            query.query,
            query.calls.toString(),
            query.totalTimeMs.toString(),
          ].join(":");
    return { index, query, selectionKey };
  });
}

function createQuerySelection(
  entry: IndexedQueryRuntimeInsight,
  queries: QueryRuntimeInsight[]
): QuerySelection {
  return {
    selectionKey: entry.selectionKey,
    snapshotSource: entry.selectionKey.startsWith("snapshot:") ? queries : null,
  };
}

function findSelectedQuery({
  queries,
  selection,
}: {
  queries: QueryRuntimeInsight[];
  selection: QuerySelection | null;
}) {
  if (
    !selection ||
    (selection.snapshotSource && selection.snapshotSource !== queries)
  ) {
    return null;
  }

  return (
    indexQueries(queries).find(
      (query) => query.selectionKey === selection.selectionKey
    )?.query ?? null
  );
}

function focusQueryDetailOnSmallScreens(
  panelRef: RefObject<HTMLElement | null>
) {
  if (!window.matchMedia?.("(max-width: 1023px)").matches) {
    return;
  }
  window.requestAnimationFrame(function focusQueryDetail() {
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView({ block: "start" });
  });
}

function filterQueries({
  kind,
  meanThreshold,
  queries,
  search,
}: {
  kind: QueryKindFilter;
  meanThreshold: number;
  queries: QueryRuntimeInsight[];
  search: string;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  return indexQueries(queries).filter(({ query }) => {
    if (!queryMatchesKind(query, kind)) {
      return false;
    }
    if (meanThreshold > 0 && query.meanTimeMs <= meanThreshold) {
      return false;
    }
    if (normalizedSearch.length === 0) {
      return true;
    }
    return queryInsightLabel(query).toLowerCase().includes(normalizedSearch);
  });
}

function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card className={cn("gap-0 py-0", className)}>{children}</Card>;
}

function MetricUnavailableNotice({
  fallback,
  onRetry,
  retryLabel,
  status,
  title,
}: {
  fallback: string;
  onRetry: () => Promise<unknown>;
  retryLabel: string;
  status: Status | undefined;
  title: string;
}) {
  return (
    <Alert className="m-5 w-auto">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{status?.message || fallback}</AlertDescription>
      <AlertAction>
        <RetryActionButton
          label={retryLabel}
          onRetry={onRetry}
          size="xs"
          variant="outline"
        />
      </AlertAction>
    </Alert>
  );
}

function QueryToolbar({
  kind,
  meanFilter,
  onKindChange,
  onMeanFilterChange,
  onSearchChange,
  search,
}: {
  kind: QueryKindFilter;
  meanFilter: MeanFilterValue;
  onKindChange: (kind: QueryKindFilter) => void;
  onMeanFilterChange: (value: MeanFilterValue) => void;
  onSearchChange: (value: string) => void;
  search: string;
}) {
  const hasActiveFacet = kind !== "all" || meanFilter !== "any";

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-start gap-2"
      data-slot="query-insights-filter-bar"
    >
      <DataTableFilter
        onChange={onSearchChange}
        placeholder="Search queries..."
        value={search}
      />
      <DataTableFacetedFilter
        onSelectedValuesChange={(values) =>
          onKindChange(queryKindFromSelectedValues(values))
        }
        options={QUERY_KIND_FILTER_OPTIONS}
        selectedValues={kind === "all" ? [] : [kind]}
        singleSelect={true}
        title="Type"
      />
      <DataTableFacetedFilter
        onSelectedValuesChange={(values) =>
          onMeanFilterChange(meanFilterFromSelectedValues(values))
        }
        options={MEAN_FILTER_OPTIONS}
        selectedValues={meanFilter === "any" ? [] : [meanFilter]}
        singleSelect={true}
        title="Mean"
      />
      {hasActiveFacet ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={() => {
            onKindChange("all");
            onMeanFilterChange("any");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X data-icon="inline-start" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

function TopQueriesTable({
  onSelectQuery,
  queries,
  selectedQueryKey,
}: {
  onSelectQuery: (query: IndexedQueryRuntimeInsight) => void;
  queries: IndexedQueryRuntimeInsight[];
  selectedQueryKey: string | null;
}) {
  if (queries.length === 0) {
    return (
      <div className="px-5 py-8 text-muted-foreground text-sm">
        No matching query runtime data.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-5 text-muted-foreground text-xs">
            Query
          </TableHead>
          <TableHead className="text-right text-muted-foreground text-xs">
            Calls
          </TableHead>
          <TableHead className="text-right text-muted-foreground text-xs">
            Mean
          </TableHead>
          <TableHead className="text-right text-muted-foreground text-xs">
            Total
          </TableHead>
          <TableHead className="w-40 text-muted-foreground text-xs">
            Relative to top
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {queries.map((entry) => {
          const { query } = entry;
          const queryLabel = queryInsightLabel(query);
          const rowSelectionKey = entry.selectionKey;
          const selected = selectedQueryKey === rowSelectionKey;
          return (
            <TableRow
              className={cn(selected && "bg-muted/70 hover:bg-muted/70")}
              key={entry.selectionKey}
            >
              <TableCell className="min-w-0 max-w-[34rem] py-2 pl-5">
                <Button
                  aria-label={queryLabel}
                  aria-pressed={selected}
                  className="h-auto w-full justify-start overflow-hidden p-0 text-left font-normal hover:bg-transparent"
                  onClick={() => onSelectQuery(entry)}
                  type="button"
                  variant="ghost"
                >
                  <SqlCodeBlock
                    copyable={false}
                    sql={queryLabel}
                    variant="inline"
                  />
                </Button>
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground text-xs tabular-nums">
                {formatInsightInteger(query.calls)}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground text-xs tabular-nums">
                {formatInsightMs(query.meanTimeMs)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatInsightMs(query.totalTimeMs)}
              </TableCell>
              <TableCell>
                <Progress
                  aria-label={`Runtime relative to top query for ${queryLabel}`}
                  className="gap-0"
                  value={insightProgressValue(query.totalTimeRatio)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function QueryPaginationFooter({
  onNextPage,
  onPageSizeChange,
  onPreviousPage,
  pageCount,
  pageIndex,
  pageSize,
  totalRows,
}: {
  onNextPage: () => void;
  onPageSizeChange: (pageSize: QueryPageSize) => void;
  onPreviousPage: () => void;
  pageCount: number;
  pageIndex: number;
  pageSize: QueryPageSize;
  totalRows: number;
}) {
  const shouldRender =
    totalRows > 0 &&
    (totalRows > QUERY_PAGE_SIZE_DEFAULT ||
      pageSize !== QUERY_PAGE_SIZE_DEFAULT);
  if (!shouldRender) {
    return null;
  }

  const { end, start } = queryPaginationRange({
    pageIndex,
    pageSize,
    totalRows,
  });
  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-2 border-t px-5 py-2 text-muted-foreground text-xs"
      data-slot="query-insights-pagination"
    >
      <span className="tabular-nums">
        Showing {start}&ndash;{end} of {totalRows}
      </span>
      <span className="ml-2 text-[11px]">Rows per page</span>
      <Select
        onValueChange={(value) => {
          if (!value) {
            return;
          }
          const nextPageSize = queryPageSizeFromValue(value);
          if (nextPageSize !== null) {
            onPageSizeChange(nextPageSize);
          }
        }}
        value={String(pageSize)}
      >
        <SelectTrigger aria-label="Rows per page" className="h-7" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {QUERY_PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} label={String(size)} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-1">
        <Button
          aria-label="Previous page"
          className="size-7 p-0"
          disabled={pageIndex <= 0}
          onClick={onPreviousPage}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronLeft className="size-3" />
        </Button>
        <span className="px-1 font-mono tabular-nums">
          Page {pageIndex + 1} of {pageCount}
        </span>
        <Button
          aria-label="Next page"
          className="size-7 p-0"
          disabled={pageIndex >= pageCount - 1}
          onClick={onNextPage}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function QueryStatsGrid({ query }: { query: QueryRuntimeInsight }) {
  const stats = [
    { label: "Calls", value: formatInsightInteger(query.calls) },
    { label: "Mean", value: formatInsightMs(query.meanTimeMs) },
    { label: "Total", value: formatInsightMs(query.totalTimeMs) },
    {
      label: "Relative to top",
      value: formatInsightPercent(query.totalTimeRatio),
    },
  ];
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {stats.map((stat) => (
        <div
          className="min-w-0 rounded-lg border border-border p-3"
          key={stat.label}
        >
          <div className="font-medium text-muted-foreground text-xs">
            {stat.label}
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function QueryDetailPanel({
  className,
  onClose,
  panelRef,
  query,
}: {
  className?: string;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  query: QueryRuntimeInsight | null;
}) {
  if (!query) {
    return null;
  }

  return (
    <section
      aria-label="Query detail"
      className={cn("min-w-0 lg:sticky lg:top-0", className)}
      ref={panelRef}
      tabIndex={-1}
    >
      <CardShell className="min-w-0">
        <CardHeader className="border-b py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <CardTitle>Query detail</CardTitle>
              <CardDescription className="font-mono text-xs">
                queryid {query.queryId.toString()}
              </CardDescription>
            </div>
            <Button
              aria-label="Close query detail"
              className="ml-auto"
              onClick={onClose}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 py-4">
          <SqlCodeBlock
            className="max-h-56"
            sql={queryInsightLabel(query)}
            wrap={true}
          />
          <QueryStatsGrid query={query} />
        </CardContent>
      </CardShell>
    </section>
  );
}

function TopQueriesCard({
  insights,
  onRetry,
  onSelectQuery,
  partialError,
  selectedQueryKey,
}: {
  insights: DatabaseQueryInsights;
  onRetry: () => Promise<unknown>;
  onSelectQuery: (query: IndexedQueryRuntimeInsight | null) => void;
  partialError: Status | undefined;
  selectedQueryKey: string | null;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<QueryKindFilter>("all");
  const [meanFilter, setMeanFilter] = useState<MeanFilterValue>("any");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<QueryPageSize>(
    QUERY_PAGE_SIZE_DEFAULT
  );
  const queries = filterQueries({
    kind,
    meanThreshold: meanFilterThreshold(meanFilter),
    queries: insights.topQueries,
    search,
  });
  const pageCount = queryPageCount(queries.length, pageSize);
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * pageSize;
  const pagedQueries = queries.slice(pageStart, pageStart + pageSize);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPageIndex(0);
    onSelectQuery(null);
  };
  const handleKindChange = (value: QueryKindFilter) => {
    setKind(value);
    setPageIndex(0);
    onSelectQuery(null);
  };
  const handleMeanFilterChange = (value: MeanFilterValue) => {
    setMeanFilter(value);
    setPageIndex(0);
    onSelectQuery(null);
  };
  const handlePageSizeChange = (value: QueryPageSize) => {
    setPageSize(value);
    setPageIndex(0);
    onSelectQuery(null);
  };
  const handlePreviousPage = () => {
    setPageIndex(Math.max(0, safePageIndex - 1));
    onSelectQuery(null);
  };
  const handleNextPage = () => {
    setPageIndex(Math.min(pageCount - 1, safePageIndex + 1));
    onSelectQuery(null);
  };

  return (
    <CardShell>
      <CardHeader className="gap-3 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <CardTitle>Top queries by total time</CardTitle>
            <CardDescription>
              pg_stat_statements entries sorted by cumulative runtime.
            </CardDescription>
          </div>
        </div>
        {insights.queryStatsAvailable ? (
          <QueryToolbar
            kind={kind}
            meanFilter={meanFilter}
            onKindChange={handleKindChange}
            onMeanFilterChange={handleMeanFilterChange}
            onSearchChange={handleSearchChange}
            search={search}
          />
        ) : null}
      </CardHeader>
      {insights.queryStatsAvailable ? (
        <TopQueriesTable
          onSelectQuery={onSelectQuery}
          queries={pagedQueries}
          selectedQueryKey={selectedQueryKey}
        />
      ) : (
        <MetricUnavailableNotice
          fallback="Query statistics are unavailable for this database. Check that pg_stat_statements is installed and queryable."
          onRetry={onRetry}
          retryLabel="Retry query statistics"
          status={partialError}
          title="Query statistics unavailable"
        />
      )}
      {insights.queryStatsAvailable ? (
        <QueryPaginationFooter
          onNextPage={handleNextPage}
          onPageSizeChange={handlePageSizeChange}
          onPreviousPage={handlePreviousPage}
          pageCount={pageCount}
          pageIndex={safePageIndex}
          pageSize={pageSize}
          totalRows={queries.length}
        />
      ) : null}
    </CardShell>
  );
}

function SequentialScanHotspotsCard({
  hotspots,
}: {
  hotspots: SequentialScanHotspot[];
}) {
  return (
    <CardShell>
      <CardHeader className="py-4">
        <CardTitle>Sequential scan hotspots</CardTitle>
        <CardDescription>
          Large tables read without matching index usage.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {hotspots.length > 0 ? (
          <div className="divide-y divide-border">
            {hotspots.map((hotspot) => (
              <div
                className="grid gap-2 px-5 py-3"
                key={`${hotspot.schemaName}.${hotspot.tableName}`}
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 truncate font-mono text-xs">
                    {formatQualifiedTable(
                      hotspot.schemaName,
                      hotspot.tableName
                    )}
                  </span>
                  <span className="ml-auto font-mono text-xs tabular-nums">
                    {formatInsightPercent(hotspot.sequentialScanRatio)}
                  </span>
                </div>
                <Progress
                  aria-label={`Sequential scan ratio for ${formatQualifiedTable(hotspot.schemaName, hotspot.tableName)}`}
                  className="gap-0"
                  value={insightProgressValue(hotspot.sequentialScanRatio)}
                  variant="warning"
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                  <span>{formatBytes(hotspot.totalSizeBytes)}</span>
                  <span>
                    {formatInsightInteger(hotspot.sequentialScans)} sequential
                    scans
                  </span>
                  <span>
                    {formatInsightInteger(hotspot.indexScans)} index scans
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 pb-5 text-muted-foreground text-sm">
            No sequential scan pressure reported yet.
          </p>
        )}
      </CardContent>
    </CardShell>
  );
}

function TableCacheHitCard({
  cacheHits,
}: {
  cacheHits: TableCacheHitInsight[];
}) {
  return (
    <CardShell>
      <CardHeader className="py-4">
        <CardTitle>Cache hit by table</CardTitle>
        <CardDescription>
          Heap blocks served from shared buffers.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {cacheHits.length > 0 ? (
          <div className="divide-y divide-border">
            {cacheHits.map((cacheHit) => {
              const warning = cacheHit.hitRatio < CACHE_HIT_WARNING_THRESHOLD;
              const label = formatQualifiedTable(
                cacheHit.schemaName,
                cacheHit.tableName
              );
              return (
                <div className="grid gap-2 px-5 py-3" key={label}>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 truncate font-mono text-xs">
                      {label}
                    </span>
                    {warning ? (
                      <span className="ml-auto">
                        <WarningBadge>Low cache hit</WarningBadge>
                      </span>
                    ) : null}
                    <span className="font-mono text-xs tabular-nums">
                      {formatInsightPercent(cacheHit.hitRatio)}
                    </span>
                  </div>
                  <Progress
                    aria-label={`${warning ? "Low cache hit, " : ""}cache hit ratio for ${label}`}
                    className="gap-0"
                    value={insightProgressValue(cacheHit.hitRatio)}
                    variant={warning ? "warning" : "default"}
                  />
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    <span>
                      {formatInsightInteger(cacheHit.heapBlocksHit)} heap hits
                    </span>
                    <span>
                      {formatInsightInteger(cacheHit.heapBlocksRead)} heap reads
                    </span>
                    <span>{formatBytes(cacheHit.totalSizeBytes)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-5 pb-5 text-muted-foreground text-sm">
            No table cache data yet.
          </p>
        )}
      </CardContent>
    </CardShell>
  );
}

function QueryInsightsEmptyState() {
  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <EmptyState
        description="Query insights need pg_stat_statements or PostgreSQL table statistics. Install the extension or grant stats access, then refresh this page."
        icon={ChartNoAxesColumnIncreasing}
        title="No query insights yet"
      />
    </div>
  );
}

function QueryInsightsContent({
  insights,
  onRetry,
  partialErrors,
}: {
  insights: DatabaseQueryInsights;
  onRetry: () => Promise<unknown>;
  partialErrors: QueryInsightPartialErrors;
}) {
  const [selectedQuerySelection, setSelectedQuerySelection] =
    useState<QuerySelection | null>(() => {
      const firstQuery = indexQueries(insights.topQueries)[0];
      return firstQuery
        ? createQuerySelection(firstQuery, insights.topQueries)
        : null;
    });
  const detailPanelRef = useRef<HTMLElement>(null);
  const selectedQuery = findSelectedQuery({
    queries: insights.topQueries,
    selection: selectedQuerySelection,
  });
  const selectedQueryKey = selectedQuery
    ? (selectedQuerySelection?.selectionKey ?? null)
    : null;
  const hasAnyStats =
    insights.queryStatsAvailable || insights.tableStatsAvailable;

  if (!hasAnyStats && Object.keys(partialErrors).length === 0) {
    return <QueryInsightsEmptyState />;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-wrap items-start gap-3 lg:col-start-1">
        <div className="min-w-0">
          <h1 className="font-bold text-2xl text-foreground tracking-tight">
            Query insights
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            From pg_stat_statements and pg_stat_user_tables, read-only
            observability.
          </p>
        </div>
      </div>
      <div className="min-w-0 lg:col-start-1">
        <TopQueriesCard
          insights={insights}
          onRetry={onRetry}
          onSelectQuery={(query) => {
            if (query) {
              setSelectedQuerySelection(
                createQuerySelection(query, insights.topQueries)
              );
              focusQueryDetailOnSmallScreens(detailPanelRef);
              return;
            }
            setSelectedQuerySelection(null);
          }}
          partialError={partialErrors.query_stats}
          selectedQueryKey={selectedQueryKey}
        />
      </div>
      <QueryDetailPanel
        className="lg:col-start-2 lg:row-span-2 lg:row-start-2"
        onClose={() => setSelectedQuerySelection(null)}
        panelRef={detailPanelRef}
        query={selectedQuery}
      />
      <div className="grid min-w-0 gap-4 lg:col-start-1 xl:grid-cols-2">
        {insights.tableStatsAvailable ? (
          <>
            <SequentialScanHotspotsCard
              hotspots={insights.sequentialScanHotspots}
            />
            <TableCacheHitCard cacheHits={insights.tableCacheHits} />
          </>
        ) : (
          <CardShell className="xl:col-span-2">
            <MetricUnavailableNotice
              fallback="Table statistics are unavailable for this database."
              onRetry={onRetry}
              retryLabel="Retry table statistics"
              status={partialErrors.table_stats}
              title="Table statistics unavailable"
            />
          </CardShell>
        )}
      </div>
    </div>
  );
}

function DatabaseQueryInsightsError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <AppInlineError
      error={normalizeAppUiError(error, {
        action: "load_query_insights",
        area: "console.database.query-insights",
        endpoint: "DatabaseQueryInsights",
        source: "query",
        surface: "inline",
      })}
      onRetry={onRetry}
    />
  );
}

function DatabaseInsightsLoadingState() {
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </div>
      <div className="h-80 rounded-xl border bg-card" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-48 rounded-xl border bg-card" />
        <div className="h-48 rounded-xl border bg-card" />
      </div>
      <span className="sr-only">Loading query insights</span>
    </div>
  );
}

function DatabaseNotFoundState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <EmptyState
          description="This database is no longer available from the backend. Select another database from the header or return to the instance overview."
          icon={CircleOff}
          title="Database not found"
        />
      </div>
    </div>
  );
}

function BackendDatabaseQueryInsightsPage({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  const databaseName = buildDatabaseName(instanceId, databaseId);
  const databaseQuery = useGetDatabaseQuery(
    { name: databaseName },
    {
      enabled: Boolean(instanceId && databaseId),
      refetchOnWindowFocus: false,
    }
  );
  const queryInsightsQuery = useGetDatabaseQueryInsightsQuery(
    { name: databaseName },
    {
      enabled: Boolean(
        databaseId && instanceId && databaseQuery.data?.database
      ),
      refetchOnWindowFocus: false,
    }
  );
  const loader = createResourceLoader(databaseQuery, "console.database");
  const insights = queryInsightsQuery.data?.queryInsights;
  const partialErrors = getQueryInsightPartialErrors(
    queryInsightsQuery.data?.partialErrors ?? []
  );
  const handleRetryQueryInsights = () => queryInsightsQuery.refetch();
  let pageContent: ReactNode;

  if (insights) {
    pageContent = (
      <div className="grid gap-4">
        {queryInsightsQuery.error ? (
          <DatabaseQueryInsightsError
            error={queryInsightsQuery.error}
            onRetry={handleRetryQueryInsights}
          />
        ) : null}
        <QueryInsightsContent
          insights={insights}
          key={databaseName}
          onRetry={handleRetryQueryInsights}
          partialErrors={partialErrors}
        />
      </div>
    );
  } else if (queryInsightsQuery.error) {
    pageContent = (
      <DatabaseQueryInsightsError
        error={queryInsightsQuery.error}
        onRetry={handleRetryQueryInsights}
      />
    );
  } else {
    pageContent = <DatabaseInsightsLoadingState />;
  }

  return (
    <ResourcePageState
      {...loader.pageStateProps}
      notFoundState={<DatabaseNotFoundState />}
      title="Loading database"
    >
      {pageContent}
    </ResourcePageState>
  );
}

export { BackendDatabaseQueryInsightsPage };
