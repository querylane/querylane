import { Link } from "@tanstack/react-router";
import {
  Check,
  Database as DatabaseIcon,
  Folder,
  Gauge,
  Layers,
  Table2,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useId } from "react";
import {
  formatMs,
  toSortedSchemas,
  widthPercent,
} from "@/components/console-pages/database-overview-model";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRows } from "@/features/data-explorer/format-rows";
import type {
  CatalogObject,
  DatabaseCatalogResult,
} from "@/hooks/api/database-catalog";
import { formatBytes, parseResourceLeafId } from "@/lib/console-resources";
import { cn } from "@/lib/utils";
import type {
  Database,
  DatabaseQueryInsights,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import type { MetricSeries } from "@/protogen/querylane/console/v1alpha1/metrics_pb";

const EXPLORER_ROUTE =
  "/instances/$instanceId/databases/$databaseId/explorer" as const;
const DATABASE_ROUTE = "/instances/$instanceId/databases/$databaseId" as const;
const INSTANCE_ROUTE = "/instances/$instanceId" as const;
const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 32;
const LOADING_ROW_KEYS = ["first", "second", "third", "fourth"] as const;
const MAX_DATABASE_ROWS = 8;

interface ExplorerParams {
  databaseId: string;
  instanceId: string;
}

// ————————————————————————————————————————————————————————————————
// Small pieces

function Eyebrow({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {children}
      </span>
      {right ? (
        <span className="font-mono text-[11px] text-muted-foreground">
          {right}
        </span>
      ) : null}
    </div>
  );
}

function CardLoadingRows({ label }: { label: string }) {
  return (
    <div aria-label={label} className="flex flex-col gap-2" role="status">
      <span className="sr-only">{label}</span>
      {LOADING_ROW_KEYS.map((key) => (
        <Skeleton aria-hidden="true" className="h-7 w-full" key={key} />
      ))}
    </div>
  );
}

/** Bounded trailing values of a metric series, NaN gaps removed. */
function sparklineValues(series: MetricSeries | undefined): number[] {
  return (series?.points?.values ?? []).filter((value) =>
    Number.isFinite(value)
  );
}

function sparklinePath(values: number[]): string {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const stepX = SPARKLINE_WIDTH / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y =
        SPARKLINE_HEIGHT -
        ((value - minimum) / span) * (SPARKLINE_HEIGHT - 2) -
        1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function TrendSparkline({ values }: { values: number[] }) {
  const gradientId = useId();
  if (values.length < 2) {
    return null;
  }
  const path = sparklinePath(values);
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-16 shrink-0 opacity-60"
      fill="none"
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.14} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT} L0,${SPARKLINE_HEIGHT} Z`}
        fill={`url(#${gradientId})`}
      />
      <path d={path} stroke="currentColor" strokeWidth={1} />
    </svg>
  );
}

function StatCell({
  className,
  label,
  sparklineValues: sparkline,
  sub,
  value,
}: {
  className?: string | undefined;
  label: string;
  sparklineValues?: number[] | undefined;
  sub?: string | undefined;
  value: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 px-5 py-4", className)}>
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </span>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono font-semibold text-[22px] text-foreground tabular-nums leading-none tracking-tight">
            {value}
          </span>
          {sub ? (
            <span className="mt-1 text-muted-foreground text-xs">{sub}</span>
          ) : null}
        </div>
        {sparkline ? <TrendSparkline values={sparkline} /> : null}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Stat strip

function lastFiniteValue(values: number[]): number | null {
  return values.length > 0 ? (values.at(-1) ?? null) : null;
}

function DatabaseStatStrip({
  catalog,
  deadTuplesSeries,
  isPending,
  liveTuplesSeries,
  sizeSeries,
}: {
  catalog: DatabaseCatalogResult | undefined;
  deadTuplesSeries: MetricSeries | undefined;
  isPending: boolean;
  liveTuplesSeries: MetricSeries | undefined;
  sizeSeries: MetricSeries | undefined;
}) {
  const totals = catalog?.totals;
  const deadValues = sparklineValues(deadTuplesSeries);
  const deadNow = lastFiniteValue(deadValues);
  const pendingValue = isPending ? "—" : undefined;
  // Below md the strip is a 2×2 grid: separate the rows with a border on the
  // first two cells and the columns with a border on odd cells.
  const cellBorders =
    "border-border max-md:odd:border-r max-md:nth-[-n+2]:border-b";
  return (
    <Card className="grid grid-cols-2 gap-0 py-0 md:grid-cols-4 md:divide-x md:divide-border">
      <StatCell
        className={cellBorders}
        label="Total size"
        sparklineValues={sparklineValues(sizeSeries)}
        sub={totals ? `${totals.schemaCount} schemas` : undefined}
        value={
          pendingValue ?? (totals ? formatBytes(totals.totalSizeBytes) : "—")
        }
      />
      <StatCell
        className={cellBorders}
        label="Tables"
        sub={totals ? `${totals.viewCount} views` : undefined}
        value={pendingValue ?? (totals ? String(totals.tableCount) : "—")}
      />
      <StatCell
        className={cellBorders}
        label="Est. rows"
        sparklineValues={sparklineValues(liveTuplesSeries)}
        sub="across user tables"
        value={
          pendingValue ?? (totals ? formatRows(totals.estimatedRows) : "—")
        }
      />
      <StatCell
        className={cellBorders}
        label="Dead tuples"
        sparklineValues={deadValues}
        sub="awaiting vacuum"
        value={deadNow === null ? "—" : formatRows(deadNow)}
      />
    </Card>
  );
}

// ————————————————————————————————————————————————————————————————
// Slowest queries

function SlowQueriesEmptyState() {
  return (
    <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <Gauge aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground text-sm">
          Query statistics are off
        </p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Install pg_stat_statements to rank queries by execution time.
        </p>
      </div>
      <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-foreground text-xs">
        CREATE EXTENSION pg_stat_statements;
      </code>
    </CardContent>
  );
}

function SlowQueryRow({
  onOpen,
  query,
}: {
  onOpen: () => void;
  query: DatabaseQueryInsights["topQueries"][number];
}) {
  return (
    <Button
      className="h-auto w-full flex-col items-start gap-1.5 whitespace-normal rounded-none px-6 py-3 text-left font-normal"
      onClick={onOpen}
      type="button"
      variant="ghost"
    >
      <code className="w-full truncate font-mono text-[13px] text-foreground">
        {query.query || "(query text unavailable)"}
      </code>
      <span className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <span className="font-mono tabular-nums">
          <span className="font-semibold text-foreground">
            {formatMs(query.meanTimeMs)}
          </span>{" "}
          mean
        </span>
        <span className="font-mono tabular-nums">
          {formatRows(Number(query.calls))} calls
        </span>
        <span className="font-mono tabular-nums">
          {formatMs(query.totalTimeMs)} total
        </span>
        <span className="ml-auto @[26rem]:block hidden h-1 w-16 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-foreground/35"
            style={{ width: widthPercent(query.totalTimeRatio) }}
          />
        </span>
      </span>
    </Button>
  );
}

function SlowQueriesBody({
  insights,
  onOpenInsights,
}: {
  insights: DatabaseQueryInsights | undefined;
  onOpenInsights: () => void;
}) {
  if (!insights?.queryStatsAvailable) {
    return <SlowQueriesEmptyState />;
  }
  return (
    <CardContent className="flex flex-col divide-y divide-border/60 p-0">
      {insights.topQueries.map((query) => (
        <SlowQueryRow
          key={`${query.queryId}-${query.query}`}
          onOpen={onOpenInsights}
          query={query}
        />
      ))}
    </CardContent>
  );
}

function SlowQueriesCard({
  insights,
  isPending,
  onOpenInsights,
}: {
  insights: DatabaseQueryInsights | undefined;
  isPending: boolean;
  onOpenInsights: () => void;
}) {
  return (
    <Card className="@container flex-1 gap-4">
      <CardHeader>
        <Eyebrow
          right={
            insights?.queryStatsAvailable
              ? "by total execution time"
              : undefined
          }
        >
          Slowest queries
        </Eyebrow>
      </CardHeader>
      {isPending ? (
        <CardContent>
          <CardLoadingRows label="Loading query statistics" />
        </CardContent>
      ) : (
        <SlowQueriesBody insights={insights} onOpenInsights={onOpenInsights} />
      )}
    </Card>
  );
}

// ————————————————————————————————————————————————————————————————
// Top tables by size

const OBJECT_KIND_ICONS: Record<
  CatalogObject["kind"],
  ComponentType<{ className?: string }>
> = {
  table: Table2,
  view: Layers,
};

function TopTableRow({
  object,
  params,
}: {
  object: CatalogObject;
  params: ExplorerParams;
}) {
  const KindIcon = OBJECT_KIND_ICONS[object.kind];
  return (
    <Link
      className="flex items-center gap-2.5 px-6 py-2 transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      params={params}
      search={{
        category: object.kind === "view" ? "views" : "tables",
        name: object.objectId,
        schema: object.schemaId,
      }}
      to={EXPLORER_ROUTE}
    >
      <KindIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">
        <span className="text-muted-foreground">{object.schemaId}.</span>
        <span className="text-foreground">{object.objectId}</span>
      </code>
      <span className="w-16 shrink-0 text-right font-mono text-[13px] text-foreground tabular-nums">
        {formatBytes(object.sizeBytes)}
      </span>
    </Link>
  );
}

function TopTablesCard({
  isPending,
  objects,
  params,
}: {
  isPending: boolean;
  objects: CatalogObject[];
  params: ExplorerParams;
}) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <Eyebrow right={isPending ? undefined : "by size"}>Top tables</Eyebrow>
      </CardHeader>
      <CardContent className="p-0">
        {isPending ? (
          <div className="px-6 pb-2">
            <CardLoadingRows label="Loading objects" />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {objects.map((object) => (
              <TopTableRow key={object.name} object={object} params={params} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ————————————————————————————————————————————————————————————————
// Schemas

function SchemasCard({
  catalog,
  isPending,
  params,
}: {
  catalog: DatabaseCatalogResult | undefined;
  isPending: boolean;
  params: ExplorerParams;
}) {
  const schemas = toSortedSchemas(catalog);
  return (
    <Card className="@container gap-4">
      <CardHeader>
        <Eyebrow right={isPending ? undefined : String(schemas.length)}>
          Schemas
        </Eyebrow>
      </CardHeader>
      <CardContent className="p-0">
        {isPending ? (
          <div className="px-6 pb-2">
            <CardLoadingRows label="Loading schemas" />
          </div>
        ) : (
          <div className="grid @[21rem]:grid-cols-2 gap-px bg-border/60">
            {schemas.map((schema) => (
              <Link
                className="flex flex-col gap-1 bg-card px-6 py-3 transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={schema.schemaId}
                params={params}
                search={{ schema: schema.schemaId }}
                to={EXPLORER_ROUTE}
              >
                <span className="flex items-center gap-2">
                  <Folder
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <code className="truncate font-medium font-mono text-[13px] text-foreground">
                    {schema.schemaId}
                  </code>
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {schema.tableCount}{" "}
                  {schema.tableCount === 1 ? "table" : "tables"}
                  {schema.viewCount > 0
                    ? ` · ${schema.viewCount} ${schema.viewCount === 1 ? "view" : "views"}`
                    : ""}
                  {` · ${formatBytes(schema.totalSizeBytes)}`}
                </span>
              </Link>
            ))}
            {schemas.length % 2 === 1 ? (
              <div
                aria-hidden="true"
                className="@[21rem]:block hidden bg-card"
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ————————————————————————————————————————————————————————————————
// Other databases on the instance

function OtherDatabaseRow({
  database,
  instanceId,
  isCurrent,
}: {
  database: Database;
  instanceId: string;
  isCurrent: boolean;
}) {
  return (
    <Link
      className={cn(
        "flex items-center gap-2.5 px-6 py-2 transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isCurrent && "bg-muted/40"
      )}
      params={{
        databaseId: parseResourceLeafId(database.name),
        instanceId,
      }}
      to={DATABASE_ROUTE}
    >
      <DatabaseIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <code className="min-w-0 flex-1 truncate font-medium font-mono text-[13px] text-foreground">
        {database.displayName}
      </code>
      {database.isSystemDatabase ? (
        <span className="shrink-0 text-[10px] text-muted-foreground uppercase tracking-wide">
          system
        </span>
      ) : null}
      {isCurrent ? (
        <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      ) : null}
    </Link>
  );
}

function OtherDatabasesCard({
  currentDatabaseId,
  databases,
  instanceId,
  isPending,
}: {
  currentDatabaseId: string;
  databases: Database[];
  instanceId: string;
  isPending: boolean;
}) {
  const overflow = Math.max(0, databases.length - MAX_DATABASE_ROWS);
  const visible =
    overflow > 0 ? databases.slice(0, MAX_DATABASE_ROWS) : databases;
  return (
    <Card className="gap-4">
      <CardHeader>
        <Eyebrow right={isPending ? undefined : String(databases.length)}>
          Databases on this instance
        </Eyebrow>
      </CardHeader>
      <CardContent className="p-0">
        {isPending ? (
          <div className="px-6 pb-2">
            <CardLoadingRows label="Loading databases" />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {visible.map((database) => (
              <OtherDatabaseRow
                database={database}
                instanceId={instanceId}
                isCurrent={
                  parseResourceLeafId(database.name) === currentDatabaseId
                }
                key={database.name}
              />
            ))}
            {overflow > 0 ? (
              <Link
                className="px-6 py-2 text-center text-muted-foreground text-xs transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                params={{ instanceId }}
                to={INSTANCE_ROUTE}
              >
                +{overflow} more on this instance
              </Link>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export {
  CardLoadingRows,
  DatabaseStatStrip,
  Eyebrow,
  OtherDatabasesCard,
  SchemasCard,
  SlowQueriesCard,
  TopTablesCard,
};
