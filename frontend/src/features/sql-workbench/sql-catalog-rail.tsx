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
  TextCursorInput,
  X,
} from "lucide-react";
import { useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { Button } from "@/components/querylane-ui/button";
import { Input } from "@/components/querylane-ui/input";
import { Skeleton } from "@/components/querylane-ui/skeleton";
import { SearchEmptyState } from "@/components/search-empty-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { highlightMatch } from "@/features/data-explorer/data-explorer-model";
import { MaterializedViewIcon } from "@/features/data-explorer/object-icons";
import {
  buildCatalogTree,
  type CatalogSchemaNode,
  filterCatalogTree,
  qualifiedRelationName,
  quoteIdentifier,
} from "@/features/sql-workbench/sql-catalog-model";
import { SQL_WORKBENCH_ERROR_CONTEXT } from "@/features/sql-workbench/sql-execution-error";
import {
  relationKey,
  type SqlRelation,
} from "@/features/sql-workbench/sql-relation";
import { relationColumnsQueryOptions } from "@/features/sql-workbench/sql-relation-columns";
import { useDatabaseCatalogQuery } from "@/hooks/api/database-catalog";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";

const EXPLORER_ROUTE =
  "/instances/$instanceId/databases/$databaseId/explorer" as const;
const SKELETON_ROWS = [
  { id: "first", width: "calc(100% * 2 / 3)" },
  { id: "second", width: "50%" },
  { id: "third", width: "60%" },
  { id: "fourth", width: "40%" },
  { id: "fifth", width: "50%" },
] as const;
const COLUMN_SKELETON_ROWS = [
  { id: "first", width: "50%" },
  { id: "second", width: "40%" },
  { id: "third", width: "60%" },
] as const;
const NO_TREE: CatalogSchemaNode[] = [];

interface CatalogRailActions {
  databaseId: string;
  /** The active tab's schema: names in it are inserted unqualified. */
  defaultSchema: string;
  instanceId: string;
  /** Inserts SQL text at the editor cursor. */
  onInsert: (text: string) => void;
  /** Opens a bounded SELECT for the relation in a new query tab and runs it. */
  onQueryRelation: (relation: SqlRelation) => void;
}

function relationIcon(relation: SqlRelation) {
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
          <Skeleton className="size-3.5 shrink-0" presentation="glyph" />
          <Skeleton
            className="h-3 w-(--skeleton-width)"
            style={{ "--skeleton-width": row.width }}
          />
        </div>
      ))}
    </div>
  );
}

function RelationLabel({
  icon: Icon,
  name,
  query,
}: {
  icon: ReturnType<typeof relationIcon>;
  name: string;
  query: string;
}) {
  return (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">
        {highlightMatch(name, query)}
      </span>
    </>
  );
}

/*
 * Row-action tooltips open above the row: a tooltip to the right would cover
 * the neighbouring icons, and Base UI keeps a tooltip open while the pointer
 * is over it, so the next icon could never be reached.
 */

/**
 * Explicit insert: clicking a name only browses (expands columns), so
 * adding text to the editor is always a deliberate action.
 */
function InsertAction({
  label,
  onInsert,
}: {
  label: string;
  onInsert: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="size-6"
            onClick={onInsert}
            presentation="muted"
            size="icon-xs"
            variant="ghost"
          >
            <TextCursorInput className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="top">Insert at the cursor</TooltipContent>
    </Tooltip>
  );
}

/**
 * Relation row actions float over the row's right edge, so names keep their
 * full width until the row is hovered or focused (touch screens always show
 * them). Column rows use their indent gutter instead.
 */
const ROW_ACTIONS_CLASS =
  "absolute inset-y-0 right-1 flex items-center bg-sidebar opacity-0 pointer-coarse:opacity-100 transition-opacity focus-within:opacity-100";

function RelationColumns({
  actions,
  relation,
}: {
  actions: CatalogRailActions;
  relation: SqlRelation;
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
          error={normalizeAppUiError(
            columns.error,
            SQL_WORKBENCH_ERROR_CONTEXT
          )}
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
      {columns.data.map((column) => {
        const identifier = quoteIdentifier(column.name);
        return (
          <li
            className="group/column relative flex h-6 items-center gap-2 rounded-sm pr-2 pl-9 text-xs hover:bg-accent/60"
            key={column.name}
          >
            {/* The insert action lives in the row's indent gutter, under the
                table chevron, so it never covers the column name or type. */}
            <span className="absolute inset-y-0 left-2 flex items-center opacity-0 pointer-coarse:opacity-100 transition-opacity focus-within:opacity-100 group-focus-within/column:opacity-100 group-hover/column:opacity-100">
              <InsertAction
                label={`Insert ${column.name} at the cursor`}
                onInsert={() => actions.onInsert(identifier)}
              />
            </span>
            {column.isPrimaryKey ? (
              <KeyRound
                aria-label="Primary key"
                className="size-3 shrink-0 text-chart-4"
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate font-mono">
              {column.name}
            </span>
            <span className="max-w-[45%] truncate font-mono text-muted-foreground">
              {column.type}
            </span>
          </li>
        );
      })}
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
  relation: SqlRelation;
}) {
  const Icon = relationIcon(relation);
  const qualified = qualifiedRelationName(relation, actions.defaultSchema);
  // ListTableColumns serves tables and materialized views; plain views have
  // nothing to expand.
  const expandable = relation.kind === "table" || relation.isMaterialized;
  return (
    <li>
      <div className="group/row relative flex items-center gap-0.5 pr-1">
        {expandable ? (
          <Button
            aria-expanded={expanded}
            className="h-[26px] min-w-0 flex-1 justify-start"
            onClick={onToggle}
            presentation="sql-relation-row"
            variant="ghost"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90"
              )}
            />
            <RelationLabel icon={Icon} name={relation.name} query={query} />
          </Button>
        ) : (
          <div className="text-(length:--text-caption) flex h-[26px] min-w-0 flex-1 items-center gap-2 px-1.5">
            <span aria-hidden="true" className="size-3.5 shrink-0" />
            <RelationLabel icon={Icon} name={relation.name} query={query} />
          </div>
        )}
        <span
          className={cn(
            ROW_ACTIONS_CLASS,
            "group-focus-within/row:opacity-100 group-hover/row:opacity-100"
          )}
        >
          <InsertAction
            label={`Insert ${qualified} at the cursor`}
            onInsert={() => actions.onInsert(qualified)}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Query ${qualified}`}
                  className="size-6"
                  onClick={() => actions.onQueryRelation(relation)}
                  presentation="muted"
                  size="icon-xs"
                  variant="ghost"
                >
                  <Play className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top">
              Select the first 100 rows in a new tab
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Open ${qualified} in Data Explorer`}
                  className="size-6"
                  presentation="muted"
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
            <TooltipContent side="top">Open in Data Explorer</TooltipContent>
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
        className="h-7 w-full justify-start"
        data-active={expanded}
        onClick={onToggle}
        presentation="tree-row"
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
 * Clicking a relation expands its columns; names reach the editor only through
 * the explicit insert action. Each relation also offers a bounded
 * sample query and a jump into the Data Explorer.
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
          error={normalizeAppUiError(
            catalog.error,
            SQL_WORKBENCH_ERROR_CONTEXT
          )}
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
            className="h-7"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter…"
            presentation="search-clearable"
            value={query}
          />
          {query ? (
            <Button
              aria-label="Clear filter"
              className="absolute top-1/2 right-1.5 size-5 -translate-y-1/2"
              onClick={() => setQuery("")}
              presentation="unpadded"
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
    </aside>
  );
}

export { SqlCatalogRail };
