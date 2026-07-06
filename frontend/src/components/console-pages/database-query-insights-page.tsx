"use client";

import {
  ChartNoAxesColumnIncreasing,
  CircleOff,
  Filter,
  Search,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { ResourcePageState } from "@/components/console-pages/console-layout";
import { EmptyState } from "@/components/empty-state";
import { Progress } from "@/components/querylane-ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import {
  buildDatabaseName,
  formatBytes,
  formatTimestampLabel,
} from "@/lib/console-resources";
import { createResourceLoader } from "@/lib/resource-loader";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import type {
  DatabaseQueryInsights,
  QueryRuntimeInsight,
  SequentialScanHotspot,
  TableCacheHitInsight,
} from "@/protogen/querylane/console/v1alpha1/database_pb";

const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_RATIO_MULTIPLIER = 100;
const CACHE_HIT_WARNING_THRESHOLD = 0.9;
const QUERY_KIND_FILTERS = ["all", "reads", "writes"] as const;
const QUERY_KEYWORD_SEPARATOR_RE = /\s+/;
const MEAN_FILTERS = [
  { label: "Mean: any", value: 0 },
  { label: "> 5 ms", value: 5 },
  { label: "> 10 ms", value: 10 },
  { label: "> 30 ms", value: 30 },
] as const;

type QueryKindFilter = (typeof QUERY_KIND_FILTERS)[number];

function formatInsightInteger(value: bigint | number) {
  return value.toLocaleString();
}

function formatInsightMs(value: number) {
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

function formatInsightPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  return `${Math.round(value * PERCENT_RATIO_MULTIPLIER).toLocaleString()}%`;
}

function formatQualifiedTable(schemaName: string, tableName: string) {
  return `${schemaName}.${tableName}`;
}

function insightProgressValue(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }

  return Math.min(ratio * PERCENT_RATIO_MULTIPLIER, PERCENT_RATIO_MULTIPLIER);
}

function queryInsightLabel(query: QueryRuntimeInsight) {
  const queryText = query.query.trim();
  if (queryText) {
    return queryText;
  }

  if (query.queryId !== 0n) {
    return `Query ID ${query.queryId.toString()}`;
  }

  return "Query text unavailable";
}

function queryKeyword(query: QueryRuntimeInsight) {
  return (
    queryInsightLabel(query)
      .trim()
      .split(QUERY_KEYWORD_SEPARATOR_RE, 1)[0]
      ?.toUpperCase() ?? ""
  );
}

function isReadQuery(query: QueryRuntimeInsight) {
  return ["EXPLAIN", "SELECT", "SHOW", "WITH"].includes(queryKeyword(query));
}

function queryMatchesKind(query: QueryRuntimeInsight, filter: QueryKindFilter) {
  switch (filter) {
    case "all":
      return true;
    case "reads":
      return isReadQuery(query);
    case "writes":
      return !isReadQuery(query);
    default:
      return filter satisfies never;
  }
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
  return queries.filter((query) => {
    if (!queryMatchesKind(query, kind)) {
      return false;
    }
    if (meanThreshold > 0 && query.meanTimeMs < meanThreshold) {
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

function QueryKindFilterButton({
  filter,
  label,
  onSelect,
  selected,
}: {
  filter: QueryKindFilter;
  label: string;
  onSelect: (filter: QueryKindFilter) => void;
  selected: boolean;
}) {
  return (
    <Button
      aria-pressed={selected}
      className={cn(
        "h-7 rounded-full px-3 text-xs",
        selected && "bg-primary text-primary-foreground hover:bg-primary/80"
      )}
      onClick={() => onSelect(filter)}
      size="sm"
      type="button"
      variant={selected ? "default" : "outline"}
    >
      {label}
    </Button>
  );
}

function MeanFilterButton({
  label,
  onSelect,
  selected,
  value,
}: {
  label: string;
  onSelect: (value: number) => void;
  selected: boolean;
  value: number;
}) {
  return (
    <Button
      aria-pressed={selected}
      className="h-7 rounded-full px-3 text-xs"
      onClick={() => onSelect(value)}
      size="sm"
      type="button"
      variant={selected ? "default" : "outline"}
    >
      {label}
    </Button>
  );
}

function QueryToolbar({
  kind,
  meanThreshold,
  onKindChange,
  onMeanThresholdChange,
  onSearchChange,
  search,
}: {
  kind: QueryKindFilter;
  meanThreshold: number;
  onKindChange: (kind: QueryKindFilter) => void;
  onMeanThresholdChange: (value: number) => void;
  onSearchChange: (value: string) => void;
  search: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="h-8 w-full sm:w-64">
        <InputGroupAddon>
          <Search aria-hidden="true" className="size-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search top queries"
          className="h-8 text-sm"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search queries..."
          type="search"
          value={search}
        />
        {search.trim() ? (
          <InputGroupAddon align="inline-end">
            <Button
              aria-label="Clear query search"
              onClick={() => onSearchChange("")}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X className="size-3" />
            </Button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        <QueryKindFilterButton
          filter="all"
          label="All"
          onSelect={onKindChange}
          selected={kind === "all"}
        />
        <QueryKindFilterButton
          filter="reads"
          label="Reads"
          onSelect={onKindChange}
          selected={kind === "reads"}
        />
        <QueryKindFilterButton
          filter="writes"
          label="Writes"
          onSelect={onKindChange}
          selected={kind === "writes"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
          <Filter aria-hidden="true" className="size-3" />
          Mean
        </span>
        {MEAN_FILTERS.map((filter) => (
          <MeanFilterButton
            key={filter.value}
            label={filter.label}
            onSelect={onMeanThresholdChange}
            selected={meanThreshold === filter.value}
            value={filter.value}
          />
        ))}
      </div>
    </div>
  );
}

function TopQueriesTable({
  onSelectQuery,
  queries,
  selectedQueryId,
}: {
  onSelectQuery: (query: QueryRuntimeInsight) => void;
  queries: QueryRuntimeInsight[];
  selectedQueryId: bigint | null;
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
            Share
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {queries.map((query) => {
          const queryLabel = queryInsightLabel(query);
          const selected =
            selectedQueryId !== null && selectedQueryId === query.queryId;
          return (
            <TableRow
              className={cn(selected && "bg-muted/70 hover:bg-muted/70")}
              key={`${query.queryId.toString()}:${query.calls.toString()}`}
            >
              <TableCell className="min-w-0 max-w-[34rem] py-2 pl-5">
                <Button
                  className="h-auto w-full justify-start overflow-hidden px-0 py-0 text-left font-normal hover:bg-transparent"
                  onClick={() => onSelectQuery(query)}
                  type="button"
                  variant="ghost"
                >
                  <span className="block min-w-0 truncate font-mono text-[12px]">
                    {queryLabel}
                  </span>
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
                  aria-label={`Total time ratio for ${queryLabel}`}
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

function QueryStatsGrid({ query }: { query: QueryRuntimeInsight }) {
  const stats = [
    { label: "Calls", value: formatInsightInteger(query.calls) },
    { label: "Mean", value: formatInsightMs(query.meanTimeMs) },
    { label: "Total", value: formatInsightMs(query.totalTimeMs) },
    { label: "Share", value: formatInsightPercent(query.totalTimeRatio) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((stat) => (
        <div className="rounded-lg border border-border p-3" key={stat.label}>
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
  onClose,
  query,
}: {
  onClose: () => void;
  query: QueryRuntimeInsight | null;
}) {
  if (!query) {
    return null;
  }

  return (
    <section aria-label="Query detail" className="lg:sticky lg:top-0">
      <CardShell>
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
        <CardContent className="grid gap-4 py-4">
          <SqlCodeBlock className="max-h-56" sql={queryInsightLabel(query)} />
          <QueryStatsGrid query={query} />
          <div className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-xs leading-relaxed">
            Statistics are cumulative since PostgreSQL last reset the
            pg_stat_statements counters.
          </div>
        </CardContent>
      </CardShell>
    </section>
  );
}

function TopQueriesCard({
  insights,
  onSelectQuery,
  selectedQuery,
}: {
  insights: DatabaseQueryInsights;
  onSelectQuery: (query: QueryRuntimeInsight | null) => void;
  selectedQuery: QueryRuntimeInsight | null;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<QueryKindFilter>("all");
  const [meanThreshold, setMeanThreshold] = useState(0);
  const queries = filterQueries({
    kind,
    meanThreshold,
    queries: insights.topQueries,
    search,
  });
  const handleSearchChange = (value: string) => {
    setSearch(value);
    onSelectQuery(null);
  };
  const handleKindChange = (value: QueryKindFilter) => {
    setKind(value);
    onSelectQuery(null);
  };
  const handleMeanThresholdChange = (value: number) => {
    setMeanThreshold(value);
    onSelectQuery(null);
  };

  return (
    <CardShell className="lg:col-span-2">
      <CardHeader className="gap-3 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <CardTitle>Top queries by total time</CardTitle>
            <CardDescription>
              pg_stat_statements entries sorted by cumulative runtime.
            </CardDescription>
          </div>
        </div>
        <QueryToolbar
          kind={kind}
          meanThreshold={meanThreshold}
          onKindChange={handleKindChange}
          onMeanThresholdChange={handleMeanThresholdChange}
          onSearchChange={handleSearchChange}
          search={search}
        />
      </CardHeader>
      <TopQueriesTable
        onSelectQuery={onSelectQuery}
        queries={queries}
        selectedQueryId={selectedQuery?.queryId ?? null}
      />
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
          Large tables read without an index since stats reset.
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
                      <Badge
                        className="ml-auto border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        variant="outline"
                      >
                        Low cache hit
                      </Badge>
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
  observedAtLabel,
}: {
  insights: DatabaseQueryInsights;
  observedAtLabel: string;
}) {
  const [selectedQuery, setSelectedQuery] =
    useState<QueryRuntimeInsight | null>(insights.topQueries[0] ?? null);
  const hasAnyStats =
    insights.queryStatsAvailable || insights.tableStatsAvailable;

  if (!hasAnyStats) {
    return <QueryInsightsEmptyState />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-2xl text-foreground tracking-tight">
              Query insights
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              From pg_stat_statements and pg_stat_user_tables — read-only
              observability.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline">Since stats reset</Badge>
            <Badge className="font-mono" variant="secondary">
              Observed {observedAtLabel}
            </Badge>
          </div>
        </div>
        <TopQueriesCard
          insights={insights}
          onSelectQuery={setSelectedQuery}
          selectedQuery={selectedQuery}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {insights.tableStatsAvailable ? (
            <>
              <SequentialScanHotspotsCard
                hotspots={insights.sequentialScanHotspots}
              />
              <TableCacheHitCard cacheHits={insights.tableCacheHits} />
            </>
          ) : (
            <CardShell className="xl:col-span-2">
              <CardContent className="py-5">
                <p className="text-muted-foreground text-sm">
                  Table statistics are unavailable for this database.
                </p>
              </CardContent>
            </CardShell>
          )}
        </div>
      </div>
      <QueryDetailPanel
        onClose={() => setSelectedQuery(null)}
        query={selectedQuery}
      />
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
  const observedAtLabel = formatTimestampLabel(insights?.observedAt);
  let pageContent: ReactNode;

  if (queryInsightsQuery.error) {
    pageContent = (
      <DatabaseQueryInsightsError
        error={queryInsightsQuery.error}
        onRetry={queryInsightsQuery.refetch}
      />
    );
  } else if (queryInsightsQuery.isPending || !insights) {
    pageContent = <DatabaseInsightsLoadingState />;
  } else {
    pageContent = (
      <QueryInsightsContent
        insights={insights}
        observedAtLabel={observedAtLabel}
      />
    );
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
