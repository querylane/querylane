"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Columns3,
  Eye,
  GitBranch,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type {
  VisualizationEdge,
  VisualizationNavigation,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";
import { useStructureMapData } from "@/features/database-visualization/structure-map-data";
import {
  buildStructureMapModel,
  type StructureMapTable,
  type StructureMapView,
} from "@/features/database-visualization/structure-map-model";
import type { VisualizationDirection } from "@/features/database-visualization/visualization-types";

const FlowCanvas = lazy(() =>
  import("@/features/database-visualization/flow-canvas").then((module) => ({
    default: module.FlowCanvas,
  }))
);

type VisualizationDetailScope = "all" | "selected-schema";

interface DatabaseStructureMapProps {
  activeSchemaName?: string | undefined;
  databaseId: string;
  databaseLabel: string;
  instanceId: string;
  onOpenResource?: (() => void) | undefined;
  targetResource?: DatabaseStructureMapTargetResource | undefined;
}

interface DatabaseStructureMapTargetResource {
  category?: "tables" | "views" | undefined;
  name?: string | undefined;
  schemaName: string;
}

type DatabaseMapVisibleNodeKind = Extract<
  VisualizationNode["kind"],
  | "column"
  | "constraint"
  | "index"
  | "key"
  | "policy"
  | "schema"
  | "table"
  | "trigger"
  | "view"
>;

type DatabaseMapNodeVisibility = Record<DatabaseMapVisibleNodeKind, boolean>;

const DATABASE_MAP_NODE_FILTERS = [
  {
    description: "Database namespaces",
    kind: "schema",
    label: "Schemas",
  },
  {
    description: "Relational tables",
    kind: "table",
    label: "Tables",
  },
  {
    description: "Standard and materialized views",
    kind: "view",
    label: "Views",
  },
  {
    description: "Table columns",
    kind: "column",
    label: "Columns",
  },
  {
    description: "Primary, unique, and foreign keys",
    kind: "key",
    label: "Keys",
  },
  {
    description: "Check and exclusion constraints",
    kind: "constraint",
    label: "Constraints",
  },
  {
    description: "Table indexes",
    kind: "index",
    label: "Indexes",
  },
  {
    description: "Row-level security policies",
    kind: "policy",
    label: "Policies",
  },
  {
    description: "Table triggers",
    kind: "trigger",
    label: "Triggers",
  },
] satisfies {
  description: string;
  kind: DatabaseMapVisibleNodeKind;
  label: string;
}[];

const DEFAULT_DATABASE_MAP_NODE_VISIBILITY = {
  column: false,
  constraint: true,
  index: false,
  key: false,
  policy: true,
  schema: true,
  table: false,
  trigger: true,
  view: false,
} satisfies DatabaseMapNodeVisibility;

const ALL_DATABASE_MAP_NODE_VISIBILITY = {
  column: true,
  constraint: true,
  index: true,
  key: true,
  policy: true,
  schema: true,
  table: true,
  trigger: true,
  view: true,
} satisfies DatabaseMapNodeVisibility;

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers3;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            {label}
          </p>
          <p className="font-semibold text-lg tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}

function databaseMapTargetNodeId(
  targetResource: DatabaseStructureMapTargetResource | undefined
): string | null {
  if (!targetResource) {
    return null;
  }
  if (targetResource.category === "tables" && targetResource.name) {
    return `table:${targetResource.schemaName}.${targetResource.name}`;
  }
  if (targetResource.category === "views" && targetResource.name) {
    return `view:${targetResource.schemaName}.${targetResource.name}`;
  }
  return `schema:${targetResource.schemaName}`;
}

function DatabaseMapLoadingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="size-4 animate-spin" /> Loading database map
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Collecting catalog metadata in the browser.
      </CardContent>
    </Card>
  );
}

function DatabaseMapCanvas({
  actionPanel,
  className,
  direction,
  edges,
  isLoading,
  nodes,
  onNavigate,
  onSelectNode,
  selectedNodeId,
}: {
  actionPanel?: ReactNode | undefined;
  className?: string | undefined;
  direction: VisualizationDirection;
  edges: VisualizationEdge[];
  isLoading: boolean;
  nodes: VisualizationNode[];
  onNavigate: (navigation: VisualizationNavigation) => void;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null | undefined;
}) {
  return isLoading && nodes.length <= 1 ? (
    <DatabaseMapLoadingCard />
  ) : (
    <Suspense fallback={<DatabaseMapLoadingCard />}>
      <FlowCanvas
        actionPanel={actionPanel}
        className={className}
        density="compact"
        direction={direction}
        edges={edges}
        nodes={nodes}
        onNavigate={onNavigate}
        onSelectNode={onSelectNode}
        selectedNodeId={selectedNodeId}
      />
    </Suspense>
  );
}

function DatabaseMapCanvasActions({
  direction,
  hiddenNodeKindCount,
  isExpanded,
  isFullMapActive,
  isSelectedSchemaActive,
  onCollapse,
  onExpand,
  onShowCurrentSchema,
  onShowFullMap,
  onShowAllNodeKinds,
  onToggleDirection,
  onToggleNodeKind,
  visibleNodeKinds,
}: {
  direction: VisualizationDirection;
  hiddenNodeKindCount: number;
  isExpanded: boolean;
  isFullMapActive: boolean;
  isSelectedSchemaActive: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onShowCurrentSchema: () => void;
  onShowFullMap: () => void;
  onShowAllNodeKinds: () => void;
  onToggleDirection: () => void;
  onToggleNodeKind: (
    kind: DatabaseMapVisibleNodeKind,
    visible: boolean
  ) => void;
  visibleNodeKinds: DatabaseMapNodeVisibility;
}) {
  return (
    <div className="flex max-w-[min(82vw,720px)] flex-wrap gap-2">
      <Button
        onClick={onToggleDirection}
        size="sm"
        type="button"
        variant="outline"
      >
        Switch to {direction === "LR" ? "vertical" : "horizontal"}
      </Button>
      <div
        className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5"
        data-slot="button-group"
      >
        <Button
          aria-pressed={isSelectedSchemaActive}
          onClick={onShowCurrentSchema}
          size="sm"
          type="button"
          variant={isSelectedSchemaActive ? "secondary" : "ghost"}
        >
          Current schema
        </Button>
        <Button
          aria-pressed={isFullMapActive}
          onClick={onShowFullMap}
          size="sm"
          type="button"
          variant={isFullMapActive ? "secondary" : "ghost"}
        >
          Full map
        </Button>
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="sm" type="button" variant="outline">
              <SlidersHorizontal className="size-3.5" />
              Resource filters
              {hiddenNodeKindCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground"
                >
                  {hiddenNodeKindCount}
                </span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-3"
        >
          <PopoverHeader>
            <PopoverTitle>Resource filters</PopoverTitle>
            <PopoverDescription>
              Add or remove database resource types from this map.
            </PopoverDescription>
          </PopoverHeader>
          <div className="grid gap-2">
            {DATABASE_MAP_NODE_FILTERS.map((filter) => {
              const switchId = `database-map-filter-${filter.kind}`;
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card/80 p-2"
                  key={filter.kind}
                >
                  <div className="min-w-0">
                    <Label htmlFor={switchId}>{filter.label}</Label>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {filter.description}
                    </p>
                  </div>
                  <Switch
                    checked={visibleNodeKinds[filter.kind]}
                    id={switchId}
                    onCheckedChange={(checked) =>
                      onToggleNodeKind(filter.kind, checked)
                    }
                    size="sm"
                  />
                </div>
              );
            })}
          </div>
          <Button
            disabled={hiddenNodeKindCount === 0}
            onClick={onShowAllNodeKinds}
            size="sm"
            type="button"
            variant="outline"
          >
            Show all resources
          </Button>
        </PopoverContent>
      </Popover>
      <Button
        aria-label={
          isExpanded ? "Collapse database map" : "Expand database map"
        }
        onClick={isExpanded ? onCollapse : onExpand}
        size="sm"
        type="button"
        variant="outline"
      >
        {isExpanded ? (
          <>
            <Minimize2 className="size-3.5" />
            Collapse
          </>
        ) : (
          <>
            <Maximize2 className="size-3.5" />
            Expand
          </>
        )}
      </Button>
    </div>
  );
}

function isDatabaseMapVisibleNodeKind(
  kind: VisualizationNode["kind"]
): kind is DatabaseMapVisibleNodeKind {
  return DATABASE_MAP_NODE_FILTERS.some((filter) => filter.kind === kind);
}

function isDatabaseMapNodeVisible(
  node: VisualizationNode,
  visibleNodeKinds: DatabaseMapNodeVisibility
): boolean {
  if (!isDatabaseMapVisibleNodeKind(node.kind)) {
    return true;
  }
  return visibleNodeKinds[node.kind];
}

function filterStructureMapModel({
  edges,
  nodes,
  visibleNodeKinds,
}: {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  visibleNodeKinds: DatabaseMapNodeVisibility;
}): { edges: VisualizationEdge[]; nodes: VisualizationNode[] } {
  const visibleNodes = nodes.filter((node) =>
    isDatabaseMapNodeVisible(node, visibleNodeKinds)
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  return {
    edges: edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    ),
    nodes: visibleNodes,
  };
}

function focusedMapResources({
  detailScope,
  isResourceFocusEnabled,
  tables,
  targetResource,
  views,
}: {
  detailScope: VisualizationDetailScope;
  isResourceFocusEnabled: boolean;
  tables: StructureMapTable[];
  targetResource: DatabaseStructureMapTargetResource | undefined;
  views: StructureMapView[];
}): {
  focusedResourceLabel: string | null;
  tables: StructureMapTable[];
  views: StructureMapView[];
} {
  if (
    !(
      isResourceFocusEnabled &&
      detailScope === "selected-schema" &&
      targetResource?.category &&
      targetResource.name
    )
  ) {
    return { focusedResourceLabel: null, tables, views };
  }

  if (targetResource.category === "tables") {
    return {
      focusedResourceLabel: `table ${targetResource.name}`,
      tables: tables.filter(
        (table) =>
          table.schemaName === targetResource.schemaName &&
          table.tableName === targetResource.name
      ),
      views: [],
    };
  }

  return {
    focusedResourceLabel: `view ${targetResource.name}`,
    tables,
    views: views.filter(
      (view) =>
        view.schemaName === targetResource.schemaName &&
        view.viewName === targetResource.name
    ),
  };
}

function DatabaseStructureMap({
  activeSchemaName,
  databaseId,
  databaseLabel,
  instanceId,
  onOpenResource,
  targetResource,
}: DatabaseStructureMapProps) {
  const navigate = useNavigate({
    from: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [resourceFocusDisabledForTarget, setResourceFocusDisabledForTarget] =
    useState<string | null>(null);
  const [visibleNodeKinds, setVisibleNodeKinds] =
    useState<DatabaseMapNodeVisibility>(DEFAULT_DATABASE_MAP_NODE_VISIBILITY);
  const [databaseSelectedNodeId, setDatabaseSelectedNodeId] = useState<
    string | null
  >(null);
  const [detailScope, setDetailScope] =
    useState<VisualizationDetailScope>("selected-schema");
  const [direction, setDirection] = useState<VisualizationDirection>("LR");
  const targetNodeId = databaseMapTargetNodeId(targetResource);
  const hasTargetResourceFocus = Boolean(
    targetResource?.category && targetResource.name
  );
  const isResourceFocusEnabled = Boolean(
    hasTargetResourceFocus &&
      targetNodeId &&
      resourceFocusDisabledForTarget !== targetNodeId
  );
  const effectiveDetailScope = isResourceFocusEnabled
    ? "selected-schema"
    : detailScope;
  const selectedNodeId =
    isResourceFocusEnabled && targetNodeId
      ? targetNodeId
      : databaseSelectedNodeId;
  const data = useStructureMapData({
    activeSchemaName,
    databaseId,
    detailScope: effectiveDetailScope,
    instanceId,
  });
  const {
    focusedResourceLabel,
    tables: mapTables,
    views: mapViews,
  } = focusedMapResources({
    detailScope: effectiveDetailScope,
    isResourceFocusEnabled,
    tables: data.tables,
    targetResource,
    views: data.views,
  });
  const model = buildStructureMapModel({
    databaseName: databaseLabel,
    schemas: data.schemas,
    tables: mapTables,
    views: mapViews,
  });
  const visibleModel = filterStructureMapModel({
    edges: model.edges,
    nodes: model.nodes,
    visibleNodeKinds,
  });
  const hiddenNodeKindCount = DATABASE_MAP_NODE_FILTERS.filter(
    (filter) => !visibleNodeKinds[filter.kind]
  ).length;
  const canvasActions = (
    <DatabaseMapCanvasActions
      direction={direction}
      hiddenNodeKindCount={hiddenNodeKindCount}
      isExpanded={false}
      isFullMapActive={effectiveDetailScope === "all"}
      isSelectedSchemaActive={
        effectiveDetailScope === "selected-schema" && !isResourceFocusEnabled
      }
      onCollapse={() => setIsMapExpanded(false)}
      onExpand={() => setIsMapExpanded(true)}
      onShowAllNodeKinds={showAllNodeKinds}
      onShowCurrentSchema={showCurrentSchema}
      onShowFullMap={showFullMap}
      onToggleDirection={() => setDirection(direction === "LR" ? "TB" : "LR")}
      onToggleNodeKind={setVisibleNodeKind}
      visibleNodeKinds={visibleNodeKinds}
    />
  );
  const expandedCanvasActions = (
    <DatabaseMapCanvasActions
      direction={direction}
      hiddenNodeKindCount={hiddenNodeKindCount}
      isExpanded={true}
      isFullMapActive={effectiveDetailScope === "all"}
      isSelectedSchemaActive={
        effectiveDetailScope === "selected-schema" && !isResourceFocusEnabled
      }
      onCollapse={() => setIsMapExpanded(false)}
      onExpand={() => setIsMapExpanded(true)}
      onShowAllNodeKinds={showAllNodeKinds}
      onShowCurrentSchema={showCurrentSchema}
      onShowFullMap={showFullMap}
      onToggleDirection={() => setDirection(direction === "LR" ? "TB" : "LR")}
      onToggleNodeKind={setVisibleNodeKind}
      visibleNodeKinds={visibleNodeKinds}
    />
  );

  function setVisibleNodeKind(
    kind: DatabaseMapVisibleNodeKind,
    visible: boolean
  ) {
    setVisibleNodeKinds((current) => ({
      ...current,
      [kind]: visible,
    }));
  }

  function showAllNodeKinds() {
    setVisibleNodeKinds(ALL_DATABASE_MAP_NODE_VISIBILITY);
  }

  function showCurrentSchema() {
    setResourceFocusDisabledForTarget(targetNodeId);
    setDetailScope("selected-schema");
  }

  function showFullMap() {
    setResourceFocusDisabledForTarget(targetNodeId);
    setDetailScope("all");
  }

  function handleNavigate(navigation: VisualizationNavigation) {
    if (navigation.to !== "explorer") {
      return;
    }
    onOpenResource?.();
    navigate({
      params: { databaseId, instanceId },
      search: (previous) => ({
        ...previous,
        category: navigation.category,
        filter: undefined,
        name: navigation.name,
        schema: navigation.schema,
        sort: undefined,
        tab: undefined,
      }),
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            Database map
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            {focusedResourceLabel
              ? `Focused on ${focusedResourceLabel}. Load the full map to see every schema object for ${databaseLabel}.`
              : `Visualizes schemas, tables, columns, keys, indexes, triggers, policies, and foreign key relationships for ${databaseLabel}.`}
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Layers3}
          label="Schemas"
          value={model.summary.schemaCount}
        />
        <StatCard
          icon={Columns3}
          label="Tables"
          value={model.summary.tableCount}
        />
        <StatCard icon={Eye} label="Views" value={model.summary.viewCount} />
        <StatCard
          icon={GitBranch}
          label="Foreign keys"
          value={model.summary.foreignKeyCount}
        />
        <StatCard
          icon={AlertCircle}
          label="Policies"
          value={model.summary.policyCount}
        />
      </div>

      {data.error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Map data failed to load</AlertTitle>
          <AlertDescription>{errorMessage(data.error)}</AlertDescription>
        </Alert>
      ) : null}
      {data.truncatedReason ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Partial map</AlertTitle>
          <AlertDescription>{data.truncatedReason}</AlertDescription>
        </Alert>
      ) : null}

      <DatabaseMapCanvas
        actionPanel={canvasActions}
        direction={direction}
        edges={visibleModel.edges}
        isLoading={data.isLoading}
        nodes={visibleModel.nodes}
        onNavigate={handleNavigate}
        onSelectNode={setDatabaseSelectedNodeId}
        selectedNodeId={selectedNodeId}
      />

      <Dialog onOpenChange={setIsMapExpanded} open={isMapExpanded}>
        <DialogContent className="!flex !max-w-[calc(100vw-1rem)] sm:!max-w-[calc(100vw-2rem)] h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col gap-3 overflow-hidden p-3 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:p-4">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>Expanded database map</DialogTitle>
            <DialogDescription>
              Use the same schema scope, layout, and selected resource with more
              room for the visual canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <DatabaseMapCanvas
              actionPanel={expandedCanvasActions}
              className="h-full min-h-0"
              direction={direction}
              edges={visibleModel.edges}
              isLoading={data.isLoading}
              nodes={visibleModel.nodes}
              onNavigate={handleNavigate}
              onSelectNode={setDatabaseSelectedNodeId}
              selectedNodeId={selectedNodeId}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { DatabaseStructureMapTargetResource };
export { DatabaseStructureMap };
