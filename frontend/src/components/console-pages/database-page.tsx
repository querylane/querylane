"use client";

import { Link } from "@tanstack/react-router";
import { CircleOff, FolderTree, Gauge } from "lucide-react";
import { useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { ResourcePageState } from "@/components/console-pages/console-layout";
import { DatabaseObjectsSection } from "@/components/console-pages/database-objects-section";
import { toTopObjects } from "@/components/console-pages/database-overview-model";
import {
  DatabaseStatStrip,
  OtherDatabasesCard,
  SchemasCard,
  SlowQueriesCard,
  TopTablesCard,
} from "@/components/console-pages/database-overview-sections";
import { DatabaseQueryInsightsDrawer } from "@/components/console-pages/database-query-insights-drawer";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  databasesForInstanceQueryInput,
  useGetDatabaseQuery,
  useGetDatabaseQueryInsightsQuery,
  useListAllDatabasesQuery,
} from "@/hooks/api/database";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";
import {
  extensionsForDatabaseQueryInput,
  useListAllExtensionsQuery,
} from "@/hooks/api/extension";
import {
  quantizedMetricsAnchor,
  useDatabaseMetricsQuery,
} from "@/hooks/api/metrics";
import { buildDatabaseName } from "@/lib/console-resources";
import { createResourceLoader } from "@/lib/resource-loader";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import type { Database } from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  MetricId,
  type MetricSeries,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

type DatabaseSection = "overview";

const EXPLORER_ROUTE =
  "/instances/$instanceId/databases/$databaseId/explorer" as const;
const METRICS_RANGE_HOURS = 24;

function DatabaseOverviewHeader({
  database,
  databaseId,
  instanceId,
  onViewQueryInsights,
}: {
  database: Database;
  databaseId: string;
  instanceId: string;
  onViewQueryInsights: () => void;
}) {
  // Schema/table/view counts live in the stat strip below; the subtitle only
  // carries properties no card repeats.
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="min-w-0 break-words font-mono font-semibold text-2xl text-foreground tracking-tight [overflow-wrap:anywhere]">
            {database.displayName}
          </h1>
          {database.isSystemDatabase ? (
            <Badge variant="secondary">system</Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          owned by{" "}
          <span className="font-mono text-foreground/80">
            {database.owner || "—"}
          </span>
          {` · ${database.characterSet || "—"} · ${database.collation || "—"}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="gap-2"
          onClick={onViewQueryInsights}
          size="sm"
          type="button"
          variant="outline"
        >
          <Gauge aria-hidden="true" className="size-4" />
          Query insights
        </Button>
        <Link
          className={cn(buttonVariants({ size: "sm" }), "gap-2")}
          params={{ databaseId, instanceId }}
          to={EXPLORER_ROUTE}
        >
          <FolderTree aria-hidden="true" className="size-4" />
          Data explorer
        </Link>
      </div>
    </div>
  );
}

function CatalogErrorNotice({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <AppInlineError
      error={normalizeAppUiError(error, {
        action: "load_database_catalog",
        area: "console.database.catalog",
        endpoint: "DatabaseCatalog",
        source: "query",
        surface: "inline",
      })}
      onRetry={onRetry}
    />
  );
}

function seriesFor(
  series: MetricSeries[] | undefined,
  metric: MetricId
): MetricSeries | undefined {
  return series?.find((candidate) => candidate.metric === metric);
}

function BackendDatabasePage({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
  section: DatabaseSection;
}) {
  const databaseName = buildDatabaseName(instanceId, databaseId);
  const [queryInsightsDatabaseName, setQueryInsightsDatabaseName] = useState<
    string | null
  >(null);
  // Stable per mount: the sparklines cover a trailing 24h window anchored at
  // page load; a page refresh advances the window.
  const [metricsAnchorMs] = useState(quantizedMetricsAnchor);
  const queryInsightsOpen = queryInsightsDatabaseName === databaseName;
  const enabled = Boolean(instanceId && databaseId);
  const databaseQuery = useGetDatabaseQuery(
    { name: databaseName },
    { enabled, refetchOnWindowFocus: false }
  );
  const catalogQuery = useDatabaseCatalogQuery({ databaseId, instanceId });
  const insightsQuery = useGetDatabaseQueryInsightsQuery(
    { name: databaseName },
    { enabled, refetchOnWindowFocus: false }
  );
  const extensionsQuery = useListAllExtensionsQuery(
    extensionsForDatabaseQueryInput({ databaseId, instanceId }),
    { enabled, refetchOnWindowFocus: false }
  );
  const databasesQuery = useListAllDatabasesQuery(
    databasesForInstanceQueryInput(instanceId),
    { enabled, refetchOnWindowFocus: false }
  );
  const metricsQuery = useDatabaseMetricsQuery({
    anchorMs: metricsAnchorMs,
    databaseId,
    instanceId,
    options: { enabled, refetchOnWindowFocus: false },
    rangeHours: METRICS_RANGE_HOURS,
  });
  const loader = createResourceLoader(databaseQuery, "console.database");
  const database = databaseQuery.data?.database;
  const catalog = catalogQuery.data;
  const catalogPending = catalogQuery.isPending;
  const insights = insightsQuery.data?.queryInsights;
  const insightsPending = insightsQuery.isPending;
  const extensions = extensionsQuery.data?.extensions ?? [];
  const metricSeries = metricsQuery.data?.series;
  const params = { databaseId, instanceId };
  const openQueryInsights = () => setQueryInsightsDatabaseName(databaseName);

  return (
    <ResourcePageState
      {...loader.pageStateProps}
      notFoundState={<DatabaseNotFoundState />}
      title="Loading database"
    >
      {database ? (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
          <DatabaseOverviewHeader
            database={database}
            databaseId={databaseId}
            instanceId={instanceId}
            onViewQueryInsights={openQueryInsights}
          />
          <DatabaseStatStrip
            catalog={catalog}
            deadTuplesSeries={seriesFor(
              metricSeries,
              MetricId.DATABASE_DEAD_TUPLES
            )}
            isPending={catalogPending}
            liveTuplesSeries={seriesFor(
              metricSeries,
              MetricId.DATABASE_LIVE_TUPLES
            )}
            sizeSeries={seriesFor(metricSeries, MetricId.DATABASE_SIZE_BYTES)}
          />
          {catalogQuery.error ? (
            <CatalogErrorNotice
              error={catalogQuery.error}
              onRetry={catalogQuery.refetch}
            />
          ) : null}
          <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <SlowQueriesCard
                insights={insights}
                isPending={insightsPending}
                onOpenInsights={openQueryInsights}
              />
              <OtherDatabasesCard
                currentDatabaseId={databaseId}
                databases={databasesQuery.data?.databases ?? []}
                instanceId={instanceId}
                isPending={databasesQuery.isPending}
              />
            </div>
            <div className="flex flex-col gap-5">
              <TopTablesCard
                isPending={catalogPending}
                objects={toTopObjects(catalog)}
                params={params}
              />
              <SchemasCard
                catalog={catalog}
                isPending={catalogPending}
                params={params}
              />
            </div>
          </div>
          <DatabaseObjectsSection
            databaseId={databaseId}
            extensions={extensions}
            extensionsPending={extensionsQuery.isPending}
            instanceId={instanceId}
          />
          {queryInsightsOpen ? (
            <DatabaseQueryInsightsDrawer
              databaseId={databaseId}
              instanceId={instanceId}
              onOpenChange={(open) => {
                if (!open) {
                  setQueryInsightsDatabaseName(null);
                }
              }}
              open={queryInsightsOpen}
            />
          ) : null}
        </div>
      ) : null}
    </ResourcePageState>
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

export { BackendDatabasePage };
