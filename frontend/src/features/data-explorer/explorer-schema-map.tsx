"use client";

import { useTransport } from "@connectrpc/connect-query";
import { createQueryOptions } from "@connectrpc/connect-query-core";
import { useQueries } from "@tanstack/react-query";
import {
  Expand,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { Input } from "@/components/ui/input";
import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import {
  buildSchemaMapModel,
  NODE_WIDTH,
  type SchemaMapNode,
  type SchemaMapTone,
  type SchemaMapViewNode,
  selectSchemaMapMetadataTableNames,
  VIEW_NODE_WIDTH,
} from "@/features/data-explorer/explorer-schema-map-model";
import { tablesForSchemaQueryInput } from "@/hooks/api/table";
import { viewsForSchemaQueryInput } from "@/hooks/api/view";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import { cn } from "@/lib/utils";
import type {
  Column,
  TableConstraint,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  listTableColumns,
  listTableConstraints,
  listTables,
} from "@/protogen/querylane/console/v1alpha1/table-TableService_connectquery";
import { listViews } from "@/protogen/querylane/console/v1alpha1/view-ViewService_connectquery";

const ALL_SCHEMAS = "All";
const DEFAULT_ZOOM = 94;
const MIN_ZOOM = 60;
const MAX_ZOOM = 130;
const ZOOM_STEP = 8;
const PERCENT_SCALE = 100;
const HULL_LABEL_OFFSET_X = 18;
const HULL_LABEL_GAP_Y = 10;
const MINIMAP_WIDTH = 132;
const MINIMAP_HEIGHT = 92;
const MINIMAP_NODE_RADIUS = 4;
const MAX_AUTO_METADATA_TABLES = 24;
const EDGE_STROKE_WIDTH = 1.5;
const SELECTED_EDGE_STROKE_WIDTH = 2;

const TONE_CLASSES: Record<
  SchemaMapTone,
  {
    dot: string;
    edge: string;
    fill: string;
    ring: string;
    stroke: string;
    text: string;
  }
> = {
  "chart-1": {
    dot: "bg-chart-1",
    edge: "stroke-chart-1",
    fill: "fill-chart-1/5",
    ring: "ring-chart-1/25",
    stroke: "stroke-chart-1/45",
    text: "text-chart-1",
  },
  "chart-2": {
    dot: "bg-chart-2",
    edge: "stroke-chart-2",
    fill: "fill-chart-2/5",
    ring: "ring-chart-2/25",
    stroke: "stroke-chart-2/45",
    text: "text-chart-2",
  },
  "chart-4": {
    dot: "bg-chart-4",
    edge: "stroke-chart-4",
    fill: "fill-chart-4/5",
    ring: "ring-chart-4/25",
    stroke: "stroke-chart-4/45",
    text: "text-chart-4",
  },
  "chart-5": {
    dot: "bg-chart-5",
    edge: "stroke-chart-5",
    fill: "fill-chart-5/5",
    ring: "ring-chart-5/25",
    stroke: "stroke-chart-5/45",
    text: "text-chart-5",
  },
  success: {
    dot: "bg-success",
    edge: "stroke-success",
    fill: "fill-success/5",
    ring: "ring-success/25",
    stroke: "stroke-success/45",
    text: "text-success",
  },
};

function useSchemaMapCatalog({
  databaseId,
  enabled,
  instanceId,
  metadataQuery,
  metadataSchemaNames,
  selectedTableName,
  schemas,
}: {
  databaseId: string;
  enabled: boolean;
  instanceId: string;
  metadataQuery: string;
  metadataSchemaNames: string[];
  selectedTableName: string | null;
  schemas: SchemaSummary[];
}) {
  const transport = useTransport();
  const tableQueries = useQueries({
    queries: schemas.map((schema) => ({
      ...createQueryOptions(
        listTables,
        tablesForSchemaQueryInput({
          databaseId,
          instanceId,
          schemaId: schema.id,
        }),
        { transport }
      ),
      ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      enabled,
    })),
  });
  const viewQueries = useQueries({
    queries: schemas.map((schema) => ({
      ...createQueryOptions(
        listViews,
        viewsForSchemaQueryInput({
          databaseId,
          instanceId,
          schemaId: schema.id,
        }),
        { transport }
      ),
      ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      enabled,
    })),
  });
  const tables = tableQueries.flatMap((query) => query.data?.tables ?? []);
  const views = viewQueries.flatMap((query) => query.data?.views ?? []);
  const tableNames = selectSchemaMapMetadataTableNames({
    limit: MAX_AUTO_METADATA_TABLES,
    query: metadataQuery,
    schemaNames: metadataSchemaNames,
    selectedTableName,
    tables,
  });
  const columnQueries = useQueries({
    queries: tableNames.map((tableName) => ({
      ...createQueryOptions(
        listTableColumns,
        { parent: tableName },
        { transport }
      ),
      ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      enabled,
    })),
  });
  const constraintQueries = useQueries({
    queries: tableNames.map((tableName) => ({
      ...createQueryOptions(
        listTableConstraints,
        { parent: tableName },
        { transport }
      ),
      ...RESOURCE_QUERY_OPTIONS.tableMetadata,
      enabled,
    })),
  });
  const columnsByTable: Record<string, Column[]> = {};
  const constraintsByTable: Record<string, TableConstraint[]> = {};
  tableNames.forEach((tableName, index) => {
    columnsByTable[tableName] = columnQueries[index]?.data?.columns ?? [];
    constraintsByTable[tableName] =
      constraintQueries[index]?.data?.constraints ?? [];
  });
  const queryErrors = [
    ...tableQueries,
    ...viewQueries,
    ...columnQueries,
    ...constraintQueries,
  ].filter((query) => query.error);

  return {
    columnsByTable,
    constraintsByTable,
    errorCount: queryErrors.length,
    isInitialLoading:
      (tableQueries.some((query) => query.isLoading) ||
        viewQueries.some((query) => query.isLoading)) &&
      tables.length === 0 &&
      views.length === 0,
    isMetadataLoading:
      columnQueries.some((query) => query.isLoading) ||
      constraintQueries.some((query) => query.isLoading),
    isTruncated:
      tableQueries.some((query) => Boolean(query.data?.nextPageToken)) ||
      viewQueries.some((query) => Boolean(query.data?.nextPageToken)),
    tables,
    views,
  };
}

function SchemaMapToolbar({
  databaseLabel,
  model,
  onFit,
  onQueryChange,
  onReset,
  onSchemaChange,
  onZoomIn,
  onZoomOut,
  query,
  selectedSchema,
  zoom,
}: {
  databaseLabel: string;
  model: ReturnType<typeof buildSchemaMapModel>;
  onFit: () => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
  onSchemaChange: (schemaName: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  query: string;
  selectedSchema: string;
  zoom: number;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="mr-1 flex items-center gap-2">
        <Network aria-hidden="true" className="size-4 text-primary" />
        <h2 className="font-semibold text-base tracking-tight">Schema map</h2>
        <Badge className="h-5 font-mono text-[11px]" variant="outline">
          {databaseLabel}
        </Badge>
      </div>
      <DataTableFacetedFilter
        onSelectedValuesChange={(values) =>
          onSchemaChange(values[0] ?? ALL_SCHEMAS)
        }
        options={model.schemaOptions}
        searchPlaceholder="Find a schema…"
        selectedValues={selectedSchema === ALL_SCHEMAS ? [] : [selectedSchema]}
        singleSelect={true}
        title="Schema"
      />
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:w-72">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Find a table"
            className="h-8 pl-8"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Find a table…"
            type="search"
            value={query}
          />
        </div>
        <div className="flex h-8 items-center overflow-hidden rounded-md border">
          <Button
            aria-label="Zoom out"
            className="h-8 rounded-none border-0"
            onClick={onZoomOut}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>
          <span className="w-12 text-center font-mono text-muted-foreground text-xs">
            {zoom}%
          </span>
          <Button
            aria-label="Zoom in"
            className="h-8 rounded-none border-0"
            onClick={onZoomIn}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <Button
          className="h-8"
          onClick={onFit}
          size="sm"
          type="button"
          variant="outline"
        >
          <Expand aria-hidden="true" className="size-4" />
          Fit
        </Button>
        <Button
          className="h-8"
          onClick={onReset}
          size="sm"
          type="button"
          variant="outline"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}

function TableNode({
  node,
  onOpen,
  onSelect,
  selected,
}: {
  node: SchemaMapNode;
  onOpen: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const tone = TONE_CLASSES[node.tone];
  const emptyColumnsLabel = node.columnsLoaded
    ? "No columns found."
    : "Select table to load details.";

  return (
    <foreignObject
      className="overflow-visible"
      height={node.height}
      width={NODE_WIDTH}
      x={node.x}
      y={node.y}
    >
      <Button
        aria-label={`${node.schemaName}.${node.name}`}
        className={cn(
          "h-full w-full flex-col items-stretch justify-start gap-0 overflow-hidden rounded-xl border bg-card p-0 text-left font-normal text-foreground shadow-sm hover:bg-card",
          selected && "ring-2",
          selected && tone.ring
        )}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onOpen();
          }
        }}
        type="button"
        variant="ghost"
      >
        <span className="flex h-9 items-center gap-2 border-b bg-muted px-3">
          <span className={cn("size-2 rounded-full", tone.dot)} />
          <span className="min-w-0 truncate font-mono font-semibold text-[13px]">
            {node.name}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
            {node.rowLabel}
          </span>
        </span>
        <span className="block py-1">
          {node.columns.length > 0 ? (
            node.columns.map((column) => (
              <span
                className="flex h-6 items-center justify-between gap-3 px-3 font-mono text-[11px]"
                key={column.name}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{column.name}</span>
                  {column.isPrimaryKey ? (
                    <Badge
                      className="h-4 shrink-0 bg-chart-4/15 px-1 text-[9px] text-chart-4"
                      variant="secondary"
                    >
                      Primary key
                    </Badge>
                  ) : null}
                  {column.isForeignKey ? (
                    <Badge
                      className="h-4 shrink-0 bg-chart-1/15 px-1 text-[9px] text-chart-1"
                      variant="secondary"
                    >
                      Foreign key
                    </Badge>
                  ) : null}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {column.type}
                </span>
              </span>
            ))
          ) : (
            <span className="block p-3 text-muted-foreground text-xs">
              {emptyColumnsLabel}
            </span>
          )}
          {node.truncatedColumnCount > 0 ? (
            <span className="block px-3 font-mono text-[11px] text-muted-foreground">
              + {node.truncatedColumnCount.toLocaleString()} more
            </span>
          ) : null}
        </span>
      </Button>
    </foreignObject>
  );
}

function ViewNode({ node }: { node: SchemaMapViewNode }) {
  const tone = TONE_CLASSES[node.tone];
  return (
    <foreignObject
      height={node.height}
      width={VIEW_NODE_WIDTH}
      x={node.x}
      y={node.y}
    >
      <div className="h-full rounded-xl border border-dashed bg-muted/30 p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-sm", tone.dot)} />
          <span className="min-w-0 truncate font-mono font-semibold text-xs">
            {node.name}
          </span>
          <Badge className="ml-auto h-4 px-1 text-[9px]" variant="outline">
            View
          </Badge>
        </div>
        <p className="mt-2 line-clamp-2 font-mono text-[10px] text-muted-foreground">
          {node.definitionLabel}
        </p>
      </div>
    </foreignObject>
  );
}

function SchemaMapMinimap({
  model,
}: {
  model: ReturnType<typeof buildSchemaMapModel>;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute right-3 bottom-3 rounded-lg border bg-background/85 p-2 shadow-sm backdrop-blur"
    >
      <svg
        className="block"
        height={MINIMAP_HEIGHT}
        viewBox={model.viewBox}
        width={MINIMAP_WIDTH}
      >
        <title>Schema map minimap</title>
        {model.hulls.map((hull) => (
          <rect
            className={cn(
              TONE_CLASSES[hull.tone].fill,
              TONE_CLASSES[hull.tone].stroke
            )}
            height={hull.height}
            key={hull.label}
            rx={MINIMAP_NODE_RADIUS}
            strokeDasharray="7 7"
            strokeWidth={2}
            width={hull.width}
            x={hull.x}
            y={hull.y}
          />
        ))}
        {model.nodes.map((node) => (
          <rect
            className="fill-muted-foreground/45"
            height={node.height}
            key={node.id}
            rx={MINIMAP_NODE_RADIUS}
            width={NODE_WIDTH}
            x={node.x}
            y={node.y}
          />
        ))}
        {model.viewNodes.map((node) => (
          <rect
            className="fill-muted-foreground/25"
            height={node.height}
            key={node.id}
            rx={MINIMAP_NODE_RADIUS}
            width={VIEW_NODE_WIDTH}
            x={node.x}
            y={node.y}
          />
        ))}
      </svg>
    </div>
  );
}

function SchemaMapCanvas({
  catalogTruncated,
  model,
  onOpenTable,
  selectedTable,
  setSelectedTable,
  zoom,
}: {
  catalogTruncated: boolean;
  model: ReturnType<typeof buildSchemaMapModel>;
  onOpenTable: (schemaName: string, tableName: string) => void;
  selectedTable: string | null;
  setSelectedTable: (tableId: string | null) => void;
  zoom: number;
}) {
  const renderedWidth = Math.round(model.worldWidth * (zoom / PERCENT_SCALE));
  const renderedHeight = Math.round(model.worldHeight * (zoom / PERCENT_SCALE));
  const activeNode =
    model.nodes.find((node) => node.id === selectedTable) ?? null;

  if (model.nodes.length === 0 && model.viewNodes.length === 0) {
    return (
      <div className="flex min-h-[26rem] items-center justify-center p-8">
        <EmptyStatePanel className="min-h-56" icon={Network}>
          No tables match this schema map filter.
        </EmptyStatePanel>
      </div>
    );
  }

  return (
    <section
      aria-label="Schema relationship map"
      className="relative min-h-[32rem] flex-1 overflow-auto bg-[radial-gradient(color-mix(in_oklch,var(--foreground)_8%,transparent)_1px,transparent_1px)] bg-[size:22px_22px] bg-background"
    >
      <svg
        className="block"
        data-testid="schema-map-canvas"
        height={renderedHeight}
        role="presentation"
        viewBox={model.viewBox}
        width={renderedWidth}
      >
        <title>Schema relationship map canvas</title>
        {model.hulls.map((hull) => (
          <g key={hull.label}>
            <rect
              className={cn(
                TONE_CLASSES[hull.tone].fill,
                TONE_CLASSES[hull.tone].stroke
              )}
              height={hull.height}
              rx={18}
              strokeDasharray="7 7"
              strokeWidth={2}
              width={hull.width}
              x={hull.x}
              y={hull.y}
            />
            <text
              className={cn(
                "fill-current stroke-background font-mono font-semibold text-[12px]",
                TONE_CLASSES[hull.tone].text
              )}
              paintOrder="stroke"
              strokeLinejoin="round"
              strokeWidth={6}
              x={hull.x + HULL_LABEL_OFFSET_X}
              y={hull.y - HULL_LABEL_GAP_Y}
            >
              {hull.label}
            </text>
          </g>
        ))}
        {model.edges.map((edge) => {
          const isConnected =
            selectedTable !== null &&
            (edge.source === selectedTable || edge.target === selectedTable);
          const isDimmed = selectedTable !== null && !isConnected;

          return (
            <path
              aria-label={`${edge.fromLabel} references ${edge.toLabel}`}
              className={cn(
                "fill-none",
                TONE_CLASSES[edge.tone].edge,
                selectedTable === null && "opacity-50",
                isConnected &&
                  "animate-[schema-map-edge-dash_0.5s_linear_infinite] opacity-95 motion-reduce:animate-none",
                isDimmed && "opacity-10"
              )}
              d={edge.d}
              key={edge.id}
              strokeDasharray={isConnected ? "7 5" : undefined}
              strokeLinecap="round"
              strokeWidth={
                isConnected ? SELECTED_EDGE_STROKE_WIDTH : EDGE_STROKE_WIDTH
              }
            />
          );
        })}
        {model.viewNodes.map((node) => (
          <ViewNode key={node.id} node={node} />
        ))}
        {model.nodes.map((node) => (
          <TableNode
            key={node.id}
            node={node}
            onOpen={() => onOpenTable(node.schemaName, node.name)}
            onSelect={() => setSelectedTable(node.id)}
            selected={selectedTable === node.id}
          />
        ))}
      </svg>
      <div className="absolute bottom-3 left-3 rounded-lg border bg-background/85 px-3 py-2 text-muted-foreground text-xs shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <span>Curved lines show foreign keys.</span>
          <span>{model.stats}</span>
        </div>
        <p className="mt-1">
          Press Space to select, or Enter or double-click to open data.
        </p>
      </div>
      <SchemaMapMinimap model={model} />
      {activeNode ? (
        <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-sm shadow-md">
          <span className="font-mono font-semibold">
            {activeNode.schemaName}.{activeNode.name}
          </span>
          <span className="text-muted-foreground">
            {activeNode.rowLabel} rows
          </span>
          <Button
            onClick={() => onOpenTable(activeNode.schemaName, activeNode.name)}
            size="sm"
            type="button"
            variant="outline"
          >
            Open data
          </Button>
          <Button
            aria-label="Clear selected table"
            onClick={() => setSelectedTable(null)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : null}
      {catalogTruncated ? (
        <p className="absolute right-3 bottom-28 rounded-lg border bg-background/90 px-3 py-2 text-muted-foreground text-xs shadow-sm">
          Some schemas have more objects. This map shows the first loaded page.
        </p>
      ) : null}
    </section>
  );
}

function ExplorerSchemaMap({
  activeSchemaName,
  databaseId,
  enabled,
  instanceId,
  onSelectTable,
  schemas,
}: {
  activeSchemaName: string;
  databaseId: string;
  enabled: boolean;
  instanceId: string;
  onSelectTable: (schemaName: string, tableName: string) => void;
  schemas: SchemaSummary[];
}) {
  const [selectedSchema, setSelectedSchema] = useState(ALL_SCHEMAS);
  const [metadataSchemaNames, setMetadataSchemaNames] = useState([
    activeSchemaName,
  ]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const catalog = useSchemaMapCatalog({
    databaseId,
    enabled,
    instanceId,
    metadataQuery: deferredQuery,
    metadataSchemaNames,
    schemas,
    selectedTableName: selectedTable,
  });
  const filterSchema = selectedSchema || ALL_SCHEMAS;
  const model = buildSchemaMapModel({
    columnsByTable: catalog.columnsByTable,
    constraintsByTable: catalog.constraintsByTable,
    filter: { query: deferredQuery, schemaName: filterSchema },
    schemas,
    tables: catalog.tables,
    views: catalog.views,
  });

  function handleReset() {
    setQuery("");
    setSelectedSchema(ALL_SCHEMAS);
    setSelectedTable(null);
    setZoom(DEFAULT_ZOOM);
  }

  return (
    <section
      aria-label={`Schema map for ${activeSchemaName}`}
      className="flex min-h-[42rem] overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <SchemaMapToolbar
          databaseLabel={databaseId}
          model={model}
          onFit={() => setZoom(DEFAULT_ZOOM)}
          onQueryChange={setQuery}
          onReset={handleReset}
          onSchemaChange={(schemaName) => {
            setSelectedSchema(schemaName);
            setSelectedTable(null);
            if (
              schemaName !== ALL_SCHEMAS &&
              !metadataSchemaNames.includes(schemaName)
            ) {
              setMetadataSchemaNames((current) => [...current, schemaName]);
            }
          }}
          onZoomIn={() =>
            setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))
          }
          onZoomOut={() =>
            setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))
          }
          query={query}
          selectedSchema={filterSchema}
          zoom={zoom}
        />
        {catalog.errorCount > 0 ? (
          <Alert className="m-3 mb-0" variant="destructive">
            <AlertTitle>Some schema metadata could not load</AlertTitle>
            <AlertDescription>
              {catalog.errorCount.toLocaleString()} map requests failed. Loaded
              tables remain visible.
            </AlertDescription>
          </Alert>
        ) : null}
        {catalog.isInitialLoading ? (
          <div
            aria-label="Loading schema map"
            className="flex min-h-[26rem] items-center justify-center text-muted-foreground"
            role="status"
          >
            Loading schema map…
          </div>
        ) : (
          <SchemaMapCanvas
            catalogTruncated={catalog.isTruncated}
            model={model}
            onOpenTable={onSelectTable}
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            zoom={zoom}
          />
        )}
        {catalog.isMetadataLoading ? (
          <p className="border-t px-3 py-2 text-muted-foreground text-xs">
            Loading columns and foreign keys…
          </p>
        ) : null}
      </div>
    </section>
  );
}

export { ExplorerSchemaMap };
