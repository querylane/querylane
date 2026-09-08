"use client";

import { useTransport } from "@connectrpc/connect-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronRight,
  Eye,
  Folder,
  Grid3x3,
  KeyRound,
  Play,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { highlightMatch } from "@/features/data-explorer/data-explorer-model";
import { MaterializedViewIcon } from "@/features/data-explorer/object-icons";
import {
  buildCatalogTree,
  type CatalogRelation,
  type CatalogSchemaNode,
  filterCatalogTree,
  qualifiedRelationName,
  quoteIdentifier,
  relationKey,
} from "@/features/sql-workbench/sql-catalog-model";
import { relationColumnsQueryOptions } from "@/features/sql-workbench/sql-relation-columns";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";

const EXPLORER_ROUTE =
  "/instances/$instanceId/databases/$databaseId/explorer" as const;
const ERROR_CONTEXT = { area: "sql-workbench", source: "query" } as const;
const SKELETON_ROWS = [
  { id: "first", width: "w-2/3" },
  { id: "second", width: "w-1/2" },
  { id: "third", width: "w-3/5" },
  { id: "fourth", width: "w-2/5" },
  { id: "fifth", width: "w-1/2" },
] as const;
const COLUMN_SKELETON_ROWS = [
  { id: "first", width: "w-1/2" },
  { id: "second", width: "w-2/5" },
  { id: "third", width: "w-3/5" },
] as const;
const NO_TREE: CatalogSchemaNode[] = [];

interface CatalogRailActions {
  databaseId: string;
  instanceId: string;
  /** Inserts SQL text at the editor cursor. */
  onInsert: (text: string) => void;
  /** Opens a bounded SELECT for the relation in a new query tab and runs it. */
  onQueryRelation: (relation: CatalogRelation) => void;
}

function relationIcon(relation: CatalogRelation) {
  if (relation.kind === "table") {
    return Grid3x3;
  }
  return relation.isMaterialized ? MaterializedViewIcon : Eye;
}

function LoadingRows({
  rows,
}: {
  rows: readonly { id: string; width: string }[];
}) {
  return (
    <div aria-busy="true" className="space-y-1.5 px-2 py-1">
      {rows.map((row) => (
        <div className="flex items-center gap-2" key={row.id}>
          <Skeleton className="size-3.5 shrink-0 rounded-sm" />
          <Skeleton className={cn("h-3", row.width)} />
        </div>
      ))}
    </div>
  );
}

function RelationColumns({
  actions,
  relation,
}: {
  actions: CatalogRailActions;
  relation: CatalogRelation;
}) {
  const transport = useTransport();
  const columns = useQuery(
    relationColumnsQueryOptions(transport, {
      databaseId: actions.databaseId,
      instanceId: actions.instanceId,
      kind: relation.kind,
      name: relation.name,
      schema: relation.schema,
    })
  );
  if (columns.isPending) {
    return (
      <div className="pl-7">
        <LoadingRows rows={COLUMN_SKELETON_ROWS} />
      </div>
    );
  }
  if (columns.isError) {
    return (
      <div className="py-1 pr-2 pl-7">
        <AppInlineError
          error={normalizeAppUiError(columns.error, ERROR_CONTEXT)}
          onRetry={() => columns.refetch()}
        />
      </div>
    );
  }
  if (columns.data.length === 0) {
    return (
      <p className="py-1 pr-2 pl-9 text-muted-foreground text-xs">No columns</p>
    );
  }
  return (
    <ul className="py-0.5">
      {columns.data.map((column) => (
        <li key={column.name}>
          <Button
            className="h-6 w-full justify-start gap-2 rounded-sm py-0 pr-2 pl-9 font-normal text-[0.75rem] hover:bg-accent/60"
            onClick={() => actions.onInsert(quoteIdentifier(column.name))}
            title={`Insert ${column.name}`}
            variant="ghost"
          >
            {column.isPrimaryKey ? (
              <KeyRound
                aria-label="Primary key"
                className="size-3 shrink-0 text-chart-4"
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-left font-mono">
              {column.name}
            </span>
            <span className="max-w-[45%] truncate font-mono text-muted-foreground text-xs">
              {column.type}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function RelationRow({
  actions,
  expanded,
  onToggle,
  query,
  relation,
}: {
  actions: CatalogRailActions;
  expanded: boolean;
  onToggle: () => void;
  query: string;
  relation: CatalogRelation;
}) {
  const Icon = relationIcon(relation);
  const qualified = qualifiedRelationName(relation);
  // ListTableColumns serves tables and materialized views; plain views have
  // nothing to expand.
  const expandable = relation.kind === "table" || relation.isMaterialized;
  return (
    <li>
      <div className="group/row flex items-center gap-0.5 pr-1">
        {expandable ? (
          <Button
            aria-expanded={expanded}
            aria-label={expanded ? "Hide columns" : "Show columns"}
            className="size-6 shrink-0 text-muted-foreground"
            onClick={onToggle}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </Button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <Button
          className="h-[26px] min-w-0 flex-1 justify-start gap-2 px-1.5 py-0 font-normal text-[0.8125rem] hover:bg-accent/60"
          onClick={() => actions.onInsert(qualified)}
          title={`Insert ${qualified} at the cursor`}
          variant="ghost"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">
            {highlightMatch(relation.name, query)}
          </span>
        </Button>
        <span className="flex shrink-0 items-center opacity-0 pointer-coarse:opacity-100 transition-opacity focus-within:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Query ${qualified}`}
                  className="size-6 text-muted-foreground"
                  onClick={() => actions.onQueryRelation(relation)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Play className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="right">
              Select the first 100 rows in a new tab
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Open ${qualified} in Data Explorer`}
                  className="size-6 text-muted-foreground"
                  render={
                    <Link
                      params={{
                        databaseId: actions.databaseId,
                        instanceId: actions.instanceId,
                      }}
                      search={{
                        category: relation.kind === "view" ? "views" : "tables",
                        name: relation.name,
                        schema: relation.schema,
                      }}
                      to={EXPLORER_ROUTE}
                    />
                  }
                  size="icon-xs"
                  variant="ghost"
                >
                  <ArrowUpRight className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="right">Open in Data Explorer</TooltipContent>
          </Tooltip>
        </span>
      </div>
      {expanded && expandable ? (
        <RelationColumns actions={actions} relation={relation} />
      ) : null}
    </li>
  );
}

function SchemaSection({
  actions,
  expanded,
  expandedRelations,
  onToggle,
  onToggleRelation,
  query,
  schema,
}: {
  actions: CatalogRailActions;
  expanded: boolean;
  expandedRelations: ReadonlySet<string>;
  onToggle: () => void;
  onToggleRelation: (key: string) => void;
  query: string;
  schema: CatalogSchemaNode;
}) {
  return (
    <li>
      <Button
        aria-expanded={expanded}
        className={cn(
          "h-7 w-full justify-start gap-2 px-2 py-0 font-normal",
          expanded ? "text-foreground" : "text-muted-foreground"
        )}
        onClick={onToggle}
        title={schema.id}
        variant="ghost"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
        <Folder
          className={cn(
            "size-4 shrink-0",
            expanded ? "text-primary" : "text-muted-foreground"
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left font-mono text-xs">
          {highlightMatch(schema.id, query)}
        </span>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">
          {schema.relations.length}
        </span>
      </Button>
      {expanded ? (
        <ul className="pl-2">
          {schema.relations.length === 0 ? (
            <li className="py-1 pl-7 text-muted-foreground text-xs">
              No tables or views
            </li>
          ) : null}
          {schema.relations.map((relation) => {
            const key = relationKey(relation);
            return (
              <RelationRow
                actions={actions}
                expanded={expandedRelations.has(key)}
                key={key}
                onToggle={() => onToggleRelation(key)}
                query={query}
                relation={relation}
              />
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function toggled(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/**
 * Object browser for the SQL workbench, rendered into the shared sidebar rail.
 * Clicking a name inserts it at the editor cursor; each relation offers a
 * bounded sample query and a jump into the Data Explorer.
 */
function SqlCatalogRail(actions: CatalogRailActions) {
  const catalog = useDatabaseCatalogQuery({
    databaseId: actions.databaseId,
    instanceId: actions.instanceId,
  });
  const [query, setQuery] = useState("");
  const [expandedSchemas, setExpandedSchemas] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [expandedRelations, setExpandedRelations] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const tree = catalog.data
    ? buildCatalogTree(catalog.data.schemas, catalog.data.objects)
    : NO_TREE;
  const filtered = filterCatalogTree(tree, query);
  const filtering = query.trim() !== "";
  const showEmptyState =
    catalog.isSuccess && filtering && filtered.length === 0;

  let body: React.ReactNode;
  if (catalog.isPending) {
    body = <LoadingRows rows={SKELETON_ROWS} />;
  } else if (catalog.isError) {
    body = (
      <div className="p-2">
        <AppInlineError
          error={normalizeAppUiError(catalog.error, ERROR_CONTEXT)}
          onRetry={() => catalog.refetch()}
        />
      </div>
    );
  } else if (showEmptyState) {
    body = <SearchEmptyState resourceName="tables and views" />;
  } else {
    body = (
      <ul aria-label="Schemas">
        {filtered.map((schema) => (
          <SchemaSection
            actions={actions}
            // A filter opens every matching schema so hits are visible at once.
            expanded={filtering || expandedSchemas.has(schema.id)}
            expandedRelations={expandedRelations}
            key={schema.id}
            onToggle={() =>
              setExpandedSchemas((current) => toggled(current, schema.id))
            }
            onToggleRelation={(key) =>
              setExpandedRelations((current) => toggled(current, key))
            }
            query={query}
            schema={schema}
          />
        ))}
      </ul>
    );
  }

  return (
    <aside
      aria-label="Database objects"
      className="flex h-full min-h-0 w-full flex-1 flex-col"
    >
      <div className="px-2 pt-2 pb-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Filter tables and views"
            className="h-7 pr-7 pl-8 text-[0.8125rem]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter…"
            value={query}
          />
          {query ? (
            <Button
              aria-label="Clear filter"
              className="absolute top-1/2 right-1.5 size-5 -translate-y-1/2 p-0"
              onClick={() => setQuery("")}
              size="icon"
              variant="ghost"
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {catalog.data?.coverage.isPartial ? (
          <p className="px-2 pb-1.5 text-muted-foreground text-xs">
            Showing the first {catalog.data.coverage.objectLimit} objects.
          </p>
        ) : null}
        {body}
      </div>
      <p className="border-sidebar-border border-t px-3 py-1.5 text-muted-foreground text-xs leading-snug">
        Click a name to insert it at the cursor.
      </p>
    </aside>
  );
}

export { SqlCatalogRail };
