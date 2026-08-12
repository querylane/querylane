"use client";

import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Eye,
  RefreshCw,
  Rows3,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { SqlNotices } from "@/components/sql/sql-notices";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DisabledReasonButton } from "@/components/ui/disabled-reason-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { isConcurrentRefreshReady } from "@/features/data-explorer/explorer-materialized-view-model";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import { ColumnsTab } from "@/features/data-explorer/explorer-table-detail/columns-tab";
import { IndexesTab } from "@/features/data-explorer/explorer-table-detail/indexes-tab";
import { TabSkeleton } from "@/features/data-explorer/explorer-table-detail/shared-ui";
import {
  databaseResourceNameFromView,
  formatViewSqlIdentifier,
  queryShapeFromDefinition,
  runnableViewDefinition,
  sourceRelationsFromDefinition,
} from "@/features/data-explorer/explorer-view-detail-model";
import { formatRows } from "@/features/data-explorer/format-rows";
import {
  ObjectDetailHeader,
  ObjectDetailTabsBar,
  ObjectDetailTabTrigger,
} from "@/features/data-explorer/object-detail-chrome";
import {
  OBJECT_DETAIL_PANEL_FILL_CLASS,
  OBJECT_DETAIL_PANEL_PADDED_CLASS,
} from "@/features/data-explorer/object-detail-panel-classes";
import { viewTypeLabel } from "@/features/data-explorer/view-type-label";
import { useExplainQuery } from "@/hooks/api/sql";
import {
  useListTableColumnsQuery,
  useListTableConstraintsQuery,
  useListTableIndexesQuery,
} from "@/hooks/api/table";
import {
  useListViewDependenciesQuery,
  useRefreshMaterializedViewMutation,
} from "@/hooks/api/view";
import {
  formatBytes,
  formatTimestampLabel,
  normalizeEstimatedRowCount,
  tryParseRelationQualifiedName,
} from "@/lib/console-resources";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import { ExplainQueryRequest_Format } from "@/protogen/querylane/console/v1alpha1/sql_pb";
import type { TableIndex } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  RefreshMaterializedViewMode,
  type View,
  View_ViewType,
  type ViewDependency,
  ViewDependency_Direction,
  ViewDependency_RelationType,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

function PurposeCard({ view }: { view: View }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Purpose
        </CardTitle>
        <CardDescription>Catalog comment for this view.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          {view.comment ||
            "No comment is saved for this view. Use the SQL definition below to understand its intent."}
        </p>
      </CardContent>
    </Card>
  );
}

function SourceRelationsCard({ definition }: { definition: string }) {
  const sources = sourceRelationsFromDefinition(definition);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Source relations
        </CardTitle>
        <CardDescription>
          Relations referenced by FROM and JOIN.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sources.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <Badge key={source} variant="secondary">
                {source}
              </Badge>
            ))}
          </div>
        ) : (
          <EmptyStatePanel className="min-h-24 rounded-md px-4 py-6" icon={Eye}>
            No source relations could be inferred from the definition.
          </EmptyStatePanel>
        )}
      </CardContent>
    </Card>
  );
}

function QueryShapeCard({ definition }: { definition: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Query shape
        </CardTitle>
        <CardDescription>What this view does to matching rows.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {queryShapeFromDefinition(definition).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DefinitionCard({ definition }: { definition: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          SQL definition
        </CardTitle>
        <CardDescription>
          Copy-pasteable SQL for recreating the view definition.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {definition ? (
          <SqlCodeBlock sql={definition} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Full SQL definition was not returned for this view.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function hasVisibleSqlNotice(notices: readonly string[]) {
  return notices.some((notice) => notice.trim().length > 0);
}

function ViewNoticeCheck({ view, viewName }: { view: View; viewName: string }) {
  const [enabled, setEnabled] = useState(false);
  const parent = databaseResourceNameFromView(view);
  const statement = `SELECT * FROM ${formatViewSqlIdentifier(view, viewName)}`;
  const noticesQuery = useExplainQuery(
    {
      format: ExplainQueryRequest_Format.TEXT,
      parent,
      statement,
    },
    {
      enabled,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );
  const notices = noticesQuery.data?.notices ?? [];
  const hasVisibleNotices = hasVisibleSqlNotice(notices);

  if (!parent) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Database notices</p>
          <p className="text-muted-foreground">
            Run a read-only view plan check and show PostgreSQL notices returned
            by the SQL service.
          </p>
        </div>
        <Button
          disabled={noticesQuery.isFetching}
          onClick={() => {
            if (enabled) {
              noticesQuery.refetch();
              return;
            }
            setEnabled(true);
          }}
          type="button"
          variant="outline"
        >
          {enabled ? "Refresh database notices" : "Check database notices"}
        </Button>
      </div>
      {enabled && noticesQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not check database notices</AlertTitle>
          <AlertDescription>
            Querylane could not fetch planner notices for this view.
          </AlertDescription>
        </Alert>
      ) : null}
      {enabled &&
      !noticesQuery.error &&
      !noticesQuery.isFetching &&
      !hasVisibleNotices ? (
        <p className="text-muted-foreground">No database notices returned.</p>
      ) : null}
      {enabled ? (
        <SqlNotices notices={notices} title="Returned notices" />
      ) : null}
    </div>
  );
}

function StandardViewDetail({
  schemaName,
  view,
  viewName,
}: {
  schemaName?: string | undefined;
  view: View | undefined;
  viewName: string;
}) {
  const definition = view?.definition.trim() ?? "";
  const copyableDefinition = view
    ? runnableViewDefinition({ definition, view, viewName })
    : "";
  const qualifiedName = schemaName ? `${schemaName}.${viewName}` : viewName;
  // The old uppercase kind eyebrow lives on as the subtitle.
  const subtitleDetails = [viewTypeLabel(view)];
  if (view?.owner) {
    subtitleDetails.push(`owner: ${view.owner}`);
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ObjectDetailHeader
        icon={Eye}
        iconClassName="bg-sky-500/10 text-sky-600 dark:text-sky-400"
        stats={
          <HeaderStat
            label="Last DDL"
            value={formatTimestampLabel(view?.lastDdlTime)}
          />
        }
        subtitle={subtitleDetails.join(" · ")}
        title={viewName}
        titleAriaLabel={qualifiedName}
        titlePrefix={schemaName ? `${schemaName}.` : undefined}
      />

      {view ? (
        <div className={OBJECT_DETAIL_PANEL_PADDED_CLASS}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 xl:grid-cols-3">
              <PurposeCard view={view} />
              <SourceRelationsCard definition={definition} />
              <QueryShapeCard definition={definition} />
            </div>
            <DefinitionCard definition={copyableDefinition} />
            <ViewNoticeCheck view={view} viewName={viewName} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type MaterializedViewTab =
  | "data"
  | "columns"
  | "indexes"
  | "dependencies"
  | "definition";
type ConcurrentRefreshReadiness =
  | "checking"
  | "ready"
  | "standard"
  | "unavailable";

const MATERIALIZED_VIEW_TABS: Array<{
  label: string;
  value: MaterializedViewTab;
}> = [
  { label: "Data", value: "data" },
  { label: "Columns", value: "columns" },
  { label: "Indexes", value: "indexes" },
  { label: "Dependencies", value: "dependencies" },
  { label: "Definition", value: "definition" },
];
const MILLISECONDS_PER_SECOND = 1000;

function isMaterializedViewTab(value: string): value is MaterializedViewTab {
  return MATERIALIZED_VIEW_TABS.some(
    (definition) => definition.value === value
  );
}

function refreshErrorMessage(error: unknown, aborted: boolean): string {
  if (aborted) {
    return "Refresh canceled.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "PostgreSQL could not refresh this materialized view.";
}

function refreshReadinessLabel(readiness: ConcurrentRefreshReadiness): string {
  switch (readiness) {
    case "checking":
      return "Checking…";
    case "ready":
      return "Concurrent ready";
    case "standard":
      return "Standard only";
    case "unavailable":
      return "Unavailable";
    default:
      return readiness satisfies never;
  }
}

function getConcurrentRefreshReadiness({
  indexes,
  indexesError,
  indexesLoaded,
  isPopulated,
}: {
  indexes: readonly TableIndex[];
  indexesError: boolean;
  indexesLoaded: boolean;
  isPopulated: boolean;
}): ConcurrentRefreshReadiness {
  if (indexesError) {
    return "unavailable";
  }
  if (!indexesLoaded) {
    return "checking";
  }
  return isConcurrentRefreshReady(isPopulated, indexes) ? "ready" : "standard";
}

function dependencyDirectionLabel(direction: ViewDependency_Direction) {
  switch (direction) {
    case ViewDependency_Direction.UPSTREAM:
      return "Upstream";
    case ViewDependency_Direction.DOWNSTREAM:
      return "Downstream";
    case ViewDependency_Direction.UNSPECIFIED:
      return "Dependency";
    default:
      return "Dependency";
  }
}

function dependencyTypeLabel(relationType: ViewDependency_RelationType) {
  switch (relationType) {
    case ViewDependency_RelationType.TABLE:
      return "Table";
    case ViewDependency_RelationType.VIEW:
      return "View";
    case ViewDependency_RelationType.MATERIALIZED_VIEW:
      return "Materialized view";
    case ViewDependency_RelationType.FOREIGN_TABLE:
      return "Foreign table";
    case ViewDependency_RelationType.PARTITIONED_TABLE:
      return "Partitioned table";
    case ViewDependency_RelationType.UNSPECIFIED:
      return "Relation";
    default:
      return "Relation";
  }
}

function DependencyLink({
  databaseId,
  dependency,
  instanceId,
}: {
  databaseId: string | undefined;
  dependency: ViewDependency;
  instanceId: string | undefined;
}) {
  const target = tryParseRelationQualifiedName(dependency.relation);
  const label = target
    ? `${target.schema}.${target.relation}`
    : `${dependency.schemaName}.${dependency.displayName}`;
  const category = dependency.relation.includes("/views/") ? "views" : "tables";
  const contents = (
    <>
      <span className="min-w-0 truncate font-mono">{label}</span>
      <Badge variant="outline">
        {dependencyTypeLabel(dependency.relationType)}
      </Badge>
      <Badge variant="secondary">
        {dependencyDirectionLabel(dependency.direction)}
      </Badge>
    </>
  );

  if (!(target && databaseId && instanceId)) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm">
        {contents}
      </div>
    );
  }

  return (
    <Link
      className={buttonVariants({
        className:
          "h-auto min-h-9 w-full min-w-0 justify-start gap-2 whitespace-normal",
        variant: "outline",
      })}
      params={{ databaseId, instanceId }}
      search={(previous) => ({
        ...previous,
        category,
        name: target.relation,
        schema: target.schema,
        tab: undefined,
      })}
      to="/instances/$instanceId/databases/$databaseId/explorer"
    >
      {contents}
    </Link>
  );
}

function DependenciesTab({
  databaseId,
  instanceId,
  query,
}: {
  databaseId: string | undefined;
  instanceId: string | undefined;
  query: ReturnType<typeof useListViewDependenciesQuery>;
}) {
  if (query.error && !query.data) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Could not load dependencies</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{query.error.message}</p>
          <Button
            onClick={() => {
              query.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const dependencies = query.data.pages.flatMap(
    (page) => page.viewDependencies
  );
  if (dependencies.length === 0) {
    return (
      <EmptyStatePanel
        description="PostgreSQL did not report direct upstream or downstream relations."
        icon={Eye}
        title="No direct dependencies"
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {dependencies.map((dependency) => (
          <DependencyLink
            databaseId={databaseId}
            dependency={dependency}
            instanceId={instanceId}
            key={dependency.name}
          />
        ))}
      </div>
      {query.error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Could not load more dependencies</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {query.hasNextPage ? (
        <Button
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {query.isFetchingNextPage ? <Spinner /> : null}
          Load more dependencies
        </Button>
      ) : null}
    </div>
  );
}

function mutationDisabledReason(mutationsAllowed: boolean): string | null {
  return mutationsAllowed
    ? null
    : "This instance is read-only. Enable mutations in its safety settings to refresh materialized views.";
}

function MaterializedRefreshControl({
  confirmationTarget,
  mutationsAllowed,
  name,
  readiness,
  rowCount,
  sizeBytes,
  viewName,
}: {
  confirmationTarget: string;
  mutationsAllowed: boolean;
  name: string;
  readiness: ConcurrentRefreshReadiness;
  rowCount: bigint;
  sizeBytes: bigint;
  viewName: string;
}) {
  const mutation = useRefreshMaterializedViewMutation();
  const confirmationId = useId();
  const controllerRef = useRef<AbortController | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const impactSummary = `${formatRows(
    normalizeEstimatedRowCount(rowCount)
  )} estimated rows · ${formatBytes(sizeBytes)}`;

  useEffect(
    function updateRefreshElapsedTime() {
      if (!(refreshing && startedAt !== null)) {
        return;
      }
      const intervalId = window.setInterval(() => {
        setElapsedSeconds(
          Math.floor((Date.now() - startedAt) / MILLISECONDS_PER_SECOND)
        );
      }, MILLISECONDS_PER_SECOND);
      return () => window.clearInterval(intervalId);
    },
    [refreshing, startedAt]
  );

  useEffect(function abortRefreshOnUnmount() {
    return () => controllerRef.current?.abort();
  }, []);

  async function refresh(mode: RefreshMaterializedViewMode) {
    const controller = new AbortController();
    controllerRef.current = controller;
    setElapsedSeconds(0);
    setErrorMessage("");
    setRefreshing(true);
    setStartedAt(Date.now());

    try {
      await mutation.mutateAsync(
        {
          confirmation,
          mode,
          name,
          signal: controller.signal,
        },
        {
          onError: (error) => {
            setErrorMessage(
              refreshErrorMessage(error, controller.signal.aborted)
            );
          },
        }
      );
      toast.success("Materialized view refreshed");
      setDialogOpen(false);
    } catch (error) {
      setErrorMessage(refreshErrorMessage(error, controller.signal.aborted));
    } finally {
      controllerRef.current = null;
      setRefreshing(false);
      setStartedAt(null);
    }
  }

  return (
    <>
      <DisabledReasonButton
        disabled={refreshing}
        disabledReason={mutationDisabledReason(mutationsAllowed)}
        onClick={() => {
          setErrorMessage("");
          setConfirmation("");
          setDialogOpen(true);
        }}
        size="sm"
        type="button"
      >
        {refreshing ? <Spinner /> : <RefreshCw />}
        Refresh
        <span className="sr-only"> materialized view</span>
      </DisabledReasonButton>
      <AlertDialog
        onOpenChange={(open) => {
          if (!refreshing) {
            setDialogOpen(open);
          }
        }}
        open={dialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh {viewName}</AlertDialogTitle>
            <AlertDialogDescription>
              A normal refresh blocks reads while PostgreSQL replaces the stored
              rows.
              {readiness === "ready"
                ? " Concurrent refresh keeps reads available and may take longer."
                : null}
              {readiness === "standard"
                ? " Concurrent refresh needs a populated view with a valid, non-partial unique index over plain columns."
                : null}
              {readiness === "checking"
                ? " Concurrent refresh readiness is still being checked."
                : null}
              {readiness === "unavailable"
                ? " Concurrent refresh readiness could not be checked."
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <Alert>
              <TriangleAlert />
              <AlertTitle>Mutation impact</AlertTitle>
              <AlertDescription className="space-y-1">
                <span className="block">{impactSummary}</span>
                <span className="block">
                  A standard refresh blocks reads until replacement finishes.
                </span>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <label className="text-sm" htmlFor={confirmationId}>
                Type <span className="font-mono">{confirmationTarget}</span> to
                confirm
              </label>
              <Input
                aria-label={`Type ${confirmationTarget} to confirm`}
                autoComplete="off"
                disabled={refreshing}
                id={confirmationId}
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </div>
          </div>
          {refreshing ? (
            <div
              aria-label="Materialized view refresh in progress"
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
              role="status"
            >
              <Spinner />
              Refreshing… {elapsedSeconds.toLocaleString()}s
            </div>
          ) : null}
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Refresh did not complete</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            {refreshing ? (
              <Button
                onClick={() => controllerRef.current?.abort()}
                type="button"
                variant="outline"
              >
                Cancel refresh
              </Button>
            ) : (
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  disabled={confirmation !== confirmationTarget}
                  onClick={() => refresh(RefreshMaterializedViewMode.STANDARD)}
                  type="button"
                  variant="outline"
                >
                  Refresh normally
                </Button>
                {readiness === "ready" ? (
                  <Button
                    disabled={confirmation !== confirmationTarget}
                    onClick={() =>
                      refresh(RefreshMaterializedViewMode.CONCURRENT)
                    }
                    type="button"
                  >
                    Refresh concurrently
                  </Button>
                ) : null}
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const MATERIALIZED_METADATA_QUERY_OPTIONS = {
  staleTime: QUERY_STALE_TIME.static,
} as const;

function ConcurrentReadinessAlert({
  readiness,
}: {
  readiness: ConcurrentRefreshReadiness;
}) {
  if (readiness === "checking" || readiness === "unavailable") {
    return null;
  }

  if (readiness === "ready") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Concurrent refresh ready</AlertTitle>
        <AlertDescription>
          A valid plain-column unique index allows reads to continue during
          refresh.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>Standard refresh only</AlertTitle>
      <AlertDescription>
        Add a valid, non-partial unique index over plain columns to enable
        concurrent refresh.
      </AlertDescription>
    </Alert>
  );
}

function MaterializedViewHeader({
  indexCount,
  indexesLoaded,
  mutationsAllowed,
  readiness,
  schemaName,
  subtitle,
  view,
  viewName,
}: {
  indexCount: number;
  indexesLoaded: boolean;
  mutationsAllowed: boolean;
  readiness: ConcurrentRefreshReadiness;
  schemaName: string | undefined;
  subtitle: string;
  view: View;
  viewName: string;
}) {
  return (
    <ObjectDetailHeader
      actions={
        <div className="flex items-center gap-2">
          {mutationsAllowed ? null : <Badge variant="outline">Read-only</Badge>}
          <MaterializedRefreshControl
            confirmationTarget={formatViewSqlIdentifier(view, viewName)}
            mutationsAllowed={mutationsAllowed}
            name={view.name}
            readiness={readiness}
            rowCount={view.rowCount}
            sizeBytes={view.sizeBytes}
            viewName={viewName}
          />
        </div>
      }
      icon={Eye}
      iconClassName="bg-sky-500/10 text-sky-600 dark:text-sky-400"
      stats={
        <>
          <HeaderStat
            label="Rows"
            value={`≈${formatRows(normalizeEstimatedRowCount(view.rowCount))}`}
          />
          <HeaderStat label="Size" value={formatBytes(view.sizeBytes)} />
          <HeaderStat
            label="Populated"
            value={view.isPopulated ? "Yes" : "No"}
          />
          <HeaderStat
            label="Indexes"
            value={indexesLoaded ? indexCount.toLocaleString() : "—"}
          />
          <HeaderStat
            label="Refresh"
            value={refreshReadinessLabel(readiness)}
          />
        </>
      }
      subtitle={subtitle}
      title={viewName}
      titleAriaLabel={schemaName ? `${schemaName}.${viewName}` : viewName}
      titlePrefix={schemaName ? `${schemaName}.` : undefined}
    />
  );
}

function MaterializedDataPanel({
  grid,
  isPopulated,
}: {
  grid: ReactNode;
  isPopulated: boolean;
}) {
  if (isPopulated) {
    return grid;
  }

  return (
    <div className={OBJECT_DETAIL_PANEL_PADDED_CLASS}>
      <EmptyStatePanel
        description="Refresh this materialized view before reading its stored rows."
        icon={Rows3}
        title="No stored rows"
      />
    </div>
  );
}

function MaterializedViewTabs({
  activeTab,
  columnsQuery,
  constraintsQuery,
  copyableDefinition,
  databaseId,
  dependenciesQuery,
  grid,
  indexesQuery,
  instanceId,
  onTabChange,
  readiness,
  schemaName,
  tabCounts,
  view,
  viewName,
}: {
  activeTab: MaterializedViewTab;
  columnsQuery: ReturnType<typeof useListTableColumnsQuery>;
  constraintsQuery: ReturnType<typeof useListTableConstraintsQuery>;
  copyableDefinition: string;
  databaseId: string | undefined;
  dependenciesQuery: ReturnType<typeof useListViewDependenciesQuery>;
  grid: ReactNode;
  indexesQuery: ReturnType<typeof useListTableIndexesQuery>;
  instanceId: string | undefined;
  onTabChange: (tab: MaterializedViewTab) => void;
  readiness: ConcurrentRefreshReadiness;
  schemaName: string | undefined;
  tabCounts: Record<MaterializedViewTab, number | undefined>;
  view: View;
  viewName: string;
}) {
  return (
    <Tabs
      className="min-h-0 w-full min-w-0 flex-1 flex-col gap-0"
      onValueChange={(value) => {
        if (isMaterializedViewTab(value)) {
          onTabChange(value);
        }
      }}
      value={activeTab}
    >
      <ObjectDetailTabsBar>
        {MATERIALIZED_VIEW_TABS.map((definition) => (
          <ObjectDetailTabTrigger
            count={tabCounts[definition.value]}
            key={definition.value}
            label={definition.label}
            value={definition.value}
          />
        ))}
      </ObjectDetailTabsBar>
      {view.comment ? (
        <p className="shrink-0 border-b bg-muted/20 px-4 py-2 text-muted-foreground text-xs sm:px-5">
          {view.comment}
        </p>
      ) : null}
      <TabsContent className={OBJECT_DETAIL_PANEL_FILL_CLASS} value="data">
        <MaterializedDataPanel grid={grid} isPopulated={view.isPopulated} />
      </TabsContent>
      <TabsContent className={OBJECT_DETAIL_PANEL_PADDED_CLASS} value="columns">
        <ColumnsTab
          columnsQuery={columnsQuery}
          constraintsQuery={constraintsQuery}
          indexesQuery={indexesQuery}
        />
      </TabsContent>
      <TabsContent className={OBJECT_DETAIL_PANEL_PADDED_CLASS} value="indexes">
        <div className="flex flex-col gap-3">
          <ConcurrentReadinessAlert readiness={readiness} />
          <IndexesTab
            heapSizeBytes={view.sizeBytes}
            query={indexesQuery}
            schemaName={schemaName ?? ""}
            table={undefined}
            tableName={viewName}
          />
        </div>
      </TabsContent>
      <TabsContent
        className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
        value="dependencies"
      >
        <DependenciesTab
          databaseId={databaseId}
          instanceId={instanceId}
          query={dependenciesQuery}
        />
      </TabsContent>
      <TabsContent
        className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
        value="definition"
      >
        <DefinitionCard definition={copyableDefinition} />
      </TabsContent>
    </Tabs>
  );
}

function MaterializedViewSurface({
  activeTab,
  columnsQuery,
  constraintsQuery,
  copyableDefinition,
  databaseId,
  dependenciesQuery,
  grid,
  indexes,
  indexesQuery,
  instanceId,
  mutationsAllowed,
  onTabChange,
  readiness,
  schemaName,
  subtitle,
  tabCounts,
  view,
  viewName,
}: {
  activeTab: MaterializedViewTab;
  columnsQuery: ReturnType<typeof useListTableColumnsQuery>;
  constraintsQuery: ReturnType<typeof useListTableConstraintsQuery>;
  copyableDefinition: string;
  databaseId: string | undefined;
  dependenciesQuery: ReturnType<typeof useListViewDependenciesQuery>;
  grid: ReactNode;
  indexes: readonly TableIndex[];
  indexesQuery: ReturnType<typeof useListTableIndexesQuery>;
  instanceId: string | undefined;
  mutationsAllowed: boolean;
  onTabChange: (tab: MaterializedViewTab) => void;
  readiness: ConcurrentRefreshReadiness;
  schemaName: string | undefined;
  subtitle: string;
  tabCounts: Record<MaterializedViewTab, number | undefined>;
  view: View;
  viewName: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MaterializedViewHeader
        indexCount={indexes.length}
        indexesLoaded={indexesQuery.data !== undefined}
        mutationsAllowed={mutationsAllowed}
        readiness={readiness}
        schemaName={schemaName}
        subtitle={subtitle}
        view={view}
        viewName={viewName}
      />
      <MaterializedViewTabs
        activeTab={activeTab}
        columnsQuery={columnsQuery}
        constraintsQuery={constraintsQuery}
        copyableDefinition={copyableDefinition}
        databaseId={databaseId}
        dependenciesQuery={dependenciesQuery}
        grid={grid}
        indexesQuery={indexesQuery}
        instanceId={instanceId}
        onTabChange={onTabChange}
        readiness={readiness}
        schemaName={schemaName}
        tabCounts={tabCounts}
        view={view}
        viewName={viewName}
      />
    </div>
  );
}

function MaterializedViewDetail({
  databaseId,
  instanceId,
  mutationsAllowed,
  schemaName,
  view,
  viewName,
}: {
  databaseId: string | undefined;
  instanceId: string | undefined;
  mutationsAllowed: boolean;
  schemaName: string | undefined;
  view: View;
  viewName: string;
}) {
  const [activeTab, setActiveTab] = useState<MaterializedViewTab>("data");
  const relationInput = { parent: view.name };
  const columnsQuery = useListTableColumnsQuery(
    relationInput,
    MATERIALIZED_METADATA_QUERY_OPTIONS
  );
  const constraintsQuery = useListTableConstraintsQuery(
    relationInput,
    MATERIALIZED_METADATA_QUERY_OPTIONS
  );
  const indexesQuery = useListTableIndexesQuery(
    relationInput,
    MATERIALIZED_METADATA_QUERY_OPTIONS
  );
  const dependenciesQuery = useListViewDependenciesQuery(view.name);
  const indexes = indexesQuery.data?.indexes ?? [];
  const readiness = getConcurrentRefreshReadiness({
    indexes,
    indexesError: Boolean(indexesQuery.error),
    indexesLoaded: indexesQuery.data !== undefined,
    isPopulated: view.isPopulated,
  });
  const copyableDefinition = runnableViewDefinition({
    definition: view.definition.trim(),
    view,
    viewName,
  });
  const dependencies = dependenciesQuery.data?.pages.flatMap(
    (page) => page.viewDependencies
  );
  const tabCounts: Record<MaterializedViewTab, number | undefined> = {
    columns: columnsQuery.data?.columns.length,
    data: undefined,
    definition: undefined,
    dependencies: dependenciesQuery.hasNextPage
      ? undefined
      : dependencies?.length,
    indexes: indexesQuery.data?.indexes.length,
  };
  const subtitleDetails = ["Materialized view"];
  if (view.owner) {
    subtitleDetails.push(`owner: ${view.owner}`);
  }
  const surfaceProps = {
    activeTab,
    columnsQuery,
    constraintsQuery,
    copyableDefinition,
    databaseId,
    dependenciesQuery,
    indexes,
    indexesQuery,
    instanceId,
    mutationsAllowed,
    onTabChange: setActiveTab,
    readiness,
    schemaName,
    subtitle: subtitleDetails.join(" · "),
    tabCounts,
    view,
    viewName,
  };

  if (!view.isPopulated) {
    return <MaterializedViewSurface {...surfaceProps} grid={null} />;
  }

  return (
    <TableDataGrid allowInsertCopy={false} key={view.name} name={view.name}>
      {({ grid }) => <MaterializedViewSurface {...surfaceProps} grid={grid} />}
    </TableDataGrid>
  );
}

function ViewDetail({
  databaseId,
  instanceId,
  mutationsAllowed,
  schemaName,
  view,
  viewName,
}: {
  databaseId?: string | undefined;
  instanceId?: string | undefined;
  mutationsAllowed: boolean;
  schemaName?: string | undefined;
  view: View | undefined;
  viewName: string;
}) {
  if (view?.viewType === View_ViewType.MATERIALIZED) {
    return (
      <MaterializedViewDetail
        databaseId={databaseId}
        instanceId={instanceId}
        mutationsAllowed={mutationsAllowed}
        schemaName={schemaName}
        view={view}
        viewName={viewName}
      />
    );
  }

  return (
    <StandardViewDetail
      schemaName={schemaName}
      view={view}
      viewName={viewName}
    />
  );
}

export { ViewDetail };
