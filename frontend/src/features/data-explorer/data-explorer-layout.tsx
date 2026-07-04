"use client";

import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import type {
  CategoryKey,
  Selection,
} from "@/features/data-explorer/data-explorer-types";
import { ExplorerEmptyState } from "@/features/data-explorer/explorer-empty-state";
import { ResourceDetail } from "@/features/data-explorer/explorer-resource-detail";
import { SchemaDetail } from "@/features/data-explorer/explorer-schema-detail";
import type { catalogSyncNotice } from "@/features/data-explorer/use-data-explorer-state";
import { parseResourceLeafId } from "@/lib/console-resources";
import type { Table } from "@/protogen/querylane/console/v1alpha1/table_pb";
import type { View } from "@/protogen/querylane/console/v1alpha1/view_pb";

export function ExplorerDetailPane({
  activeSchema,
  databaseId,
  hasMoreTables,
  hasMoreViews,
  instanceId,
  onSelectResource,
  overviewTables,
  overviewViews,
  rawTables,
  rawViews,
  selectedResourceError,
  selection,
  tablesError,
  tablesLoading,
  tablesSyncNotice,
  viewsError,
  viewsLoading,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  hasMoreTables: boolean;
  hasMoreViews: boolean;
  instanceId: string;
  onSelectResource: (category: CategoryKey, name: string) => void;
  // Unfiltered schema-overview protos (not narrowed by the sidebar search) —
  // used for the schema inventory + header aggregates.
  overviewTables: Table[];
  overviewViews: View[];
  // Sidebar-filtered protos — used only to resolve the selected resource.
  rawTables: Table[];
  rawViews: View[];
  selectedResourceError: unknown;
  selection: Selection;
  tablesError: unknown;
  tablesLoading: boolean;
  tablesSyncNotice: ReturnType<typeof catalogSyncNotice>;
  viewsError: unknown;
  viewsLoading: boolean;
}) {
  if (!activeSchema) {
    return <ExplorerEmptyState hasError={Boolean(selectedResourceError)} />;
  }
  if (selection.kind === "schema") {
    return (
      <SchemaDetail
        hasMoreTables={hasMoreTables}
        hasMoreViews={hasMoreViews}
        onSelectTable={(name) => onSelectResource("tables", name)}
        onSelectView={(name) => onSelectResource("views", name)}
        owner={activeSchema.owner}
        schemaName={activeSchema.name}
        tables={overviewTables}
        tablesError={tablesError}
        tablesLoading={tablesLoading}
        tablesSyncNotice={tablesSyncNotice}
        views={overviewViews}
        viewsError={viewsError}
        viewsLoading={viewsLoading}
      />
    );
  }
  const selectedTable =
    selection.category === "tables"
      ? rawTables.find(
          (table) =>
            (table.displayName || parseResourceLeafId(table.name)) ===
            selection.name
        )
      : undefined;
  const selectedView =
    selection.category === "views"
      ? rawViews.find(
          (view) =>
            (view.displayName || parseResourceLeafId(view.name)) ===
            selection.name
        )
      : undefined;
  if (selectedResourceError && !(selectedTable || selectedView)) {
    return <ExplorerEmptyState hasError={true} />;
  }
  return (
    <ResourceDetail
      category={selection.category}
      databaseId={databaseId}
      instanceId={instanceId}
      name={selection.name}
      schemaName={activeSchema.name}
      table={selectedTable}
      view={selectedView}
    />
  );
}
