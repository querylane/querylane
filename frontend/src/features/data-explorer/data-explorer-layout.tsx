"use client";

import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import type {
  CategoryKey,
  Selection,
} from "@/features/data-explorer/data-explorer-types";
import { ExplorerEmptyState } from "@/features/data-explorer/explorer-empty-state";
import { ResourceDetail } from "@/features/data-explorer/explorer-resource-detail";
import { SchemaDetail } from "@/features/data-explorer/explorer-schema-detail";
import type { SchemaDetailTab } from "@/features/data-explorer/schema-detail-tab";
import type { TableDetailTab } from "@/features/data-explorer/table-detail-tab";
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
  onSchemaTabChange,
  onOpenReferencedTable,
  onTableTabChange,
  onSelectResource,
  onSelectTableInSchema,
  overviewTables,
  overviewViews,
  rawTables,
  rawViews,
  schemas,
  schemaTab,
  selectedResourceError,
  selection,
  tablesError,
  tablesLoading,
  tablesSyncNotice,
  tableTab,
  viewsError,
  viewsLoading,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  hasMoreTables: boolean;
  hasMoreViews: boolean;
  instanceId: string;
  onSchemaTabChange: (tab: SchemaDetailTab) => void;
  onOpenReferencedTable?: ((tableName: string) => void) | undefined;
  onTableTabChange: (tab: TableDetailTab) => void;
  onSelectResource: (category: CategoryKey, name: string) => void;
  onSelectTableInSchema: (schemaName: string, name: string) => void;
  // Unfiltered schema-overview protos (not narrowed by the sidebar search) —
  // used for the schema inventory + header aggregates.
  overviewTables: Table[];
  overviewViews: View[];
  // Sidebar-filtered protos — used only to resolve the selected resource.
  rawTables: Table[];
  rawViews: View[];
  schemas: SchemaSummary[];
  schemaTab: SchemaDetailTab;
  selectedResourceError: unknown;
  selection: Selection;
  tablesError: unknown;
  tablesLoading: boolean;
  tablesSyncNotice: ReturnType<typeof catalogSyncNotice>;
  tableTab: string | undefined;
  viewsError: unknown;
  viewsLoading: boolean;
}) {
  if (!activeSchema) {
    return <ExplorerEmptyState hasError={Boolean(selectedResourceError)} />;
  }
  if (selection.kind === "schema") {
    return (
      <SchemaDetail
        activeTab={schemaTab}
        databaseId={databaseId}
        hasMoreTables={hasMoreTables}
        hasMoreViews={hasMoreViews}
        instanceId={instanceId}
        onSelectTable={(name) => onSelectResource("tables", name)}
        onSelectTableInSchema={onSelectTableInSchema}
        onSelectView={(name) => onSelectResource("views", name)}
        onTabChange={onSchemaTabChange}
        owner={activeSchema.owner}
        schemaName={activeSchema.name}
        schemas={schemas}
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
      onOpenReferencedTable={onOpenReferencedTable}
      onTableTabChange={onTableTabChange}
      schemaName={activeSchema.name}
      table={selectedTable}
      tableTab={tableTab}
      view={selectedView}
    />
  );
}
