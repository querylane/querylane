"use client";

import { Link } from "@tanstack/react-router";
import { Table2 } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { HeaderStat } from "@/features/data-explorer/explorer-shared-ui";
import { ColumnsTab } from "@/features/data-explorer/explorer-table-detail/columns-tab";
import { ConstraintsTab } from "@/features/data-explorer/explorer-table-detail/constraints-tab";
import { DefinitionTab } from "@/features/data-explorer/explorer-table-detail/definition-tab";
import { IndexesTab } from "@/features/data-explorer/explorer-table-detail/indexes-tab";
import {
  deriveForeignKeyReferences,
  deriveTableKeyRows,
} from "@/features/data-explorer/explorer-table-detail/keys-model";
import { KeysTab } from "@/features/data-explorer/explorer-table-detail/keys-tab";
import {
  TABLE_DETAIL_TABS,
  TABLE_TYPE_LABELS,
} from "@/features/data-explorer/explorer-table-detail/options";
import { PartitionsTab } from "@/features/data-explorer/explorer-table-detail/partitions-tab";
import { PoliciesTab } from "@/features/data-explorer/explorer-table-detail/policies-tab";
import { TabSkeleton } from "@/features/data-explorer/explorer-table-detail/shared-ui";
import { TriggersTab } from "@/features/data-explorer/explorer-table-detail/triggers-tab";
import { derivePartitionTabCount } from "@/features/data-explorer/explorer-table-partitions";
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
import {
  isTableDetailTab,
  type TableDetailTab,
} from "@/features/data-explorer/table-detail-tab";
import {
  useGetTablePartitionMetadataQuery,
  useListTableColumnsQuery,
  useListTableConstraintsQuery,
  useListTableIndexesQuery,
  useListTablePoliciesQuery,
  useListTableTriggersQuery,
} from "@/hooks/api/table";
import {
  buildTableName,
  formatBytes,
  normalizeEstimatedRowCount,
  tryParseTableQualifiedName,
} from "@/lib/console-resources";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import type { Table as TableProto } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const TABLE_METADATA_QUERY_OPTIONS = {
  staleTime: QUERY_STALE_TIME.static,
} as const;

function TableDetailHeader({
  columnCount,
  lastFetchedLabel,
  schemaName,
  table,
  tableName,
}: {
  columnCount: number | undefined;
  lastFetchedLabel: string;
  schemaName: string;
  table: TableProto | undefined;
  tableName: string;
}) {
  const typeLabel = table ? TABLE_TYPE_LABELS[table.tableType] : "";
  const rowsLabel = table
    ? `≈${formatRows(normalizeEstimatedRowCount(table.rowCount))}`
    : "—";
  const sizeLabel = formatBytes(table?.sizeBytes);
  // The old uppercase "Table" eyebrow lives on as the kind in the subtitle.
  const headerDetails: string[] = [typeLabel || "table"];
  if (columnCount !== undefined) {
    headerDetails.push(`${columnCount.toLocaleString()} columns`);
  }
  if (lastFetchedLabel) {
    headerDetails.push(lastFetchedLabel);
  }
  return (
    <ObjectDetailHeader
      icon={Table2}
      iconClassName="bg-primary/10 text-primary"
      stats={
        <>
          <HeaderStat label="Rows" value={rowsLabel} />
          <HeaderStat label="Size" value={sizeLabel} />
        </>
      }
      subtitle={headerDetails.join(" · ")}
      title={tableName}
      titleAriaLabel={`${schemaName}.${tableName}`}
      titlePrefix={`${schemaName}.`}
    />
  );
}

function TableDetail({
  databaseId,
  initialTab = "data",
  instanceId,
  onTabChange,
  schemaName,
  table,
  tableName,
}: {
  databaseId: string;
  initialTab?: string | undefined;
  instanceId: string;
  onTabChange?: ((tab: TableDetailTab) => void) | undefined;
  schemaName: string;
  table: TableProto | undefined;
  tableName: string;
}) {
  const resolvedUrlTab = isTableDetailTab(initialTab) ? initialTab : "data";
  // The tab selection is owned locally so a click re-renders the tab bar
  // immediately; the URL write and the heavy panel mount follow. deferredTab
  // gates the data grid so the active-tab indicator paints before
  // react-data-grid mounts instead of blocking on it.
  const [activeTab, setActiveTab] = useState<TableDetailTab>(resolvedUrlTab);
  const deferredTab = useDeferredValue(activeTab);

  useEffect(
    function syncActiveTabWithUrl() {
      setActiveTab(resolvedUrlTab);
    },
    [resolvedUrlTab]
  );

  function handleTabChange(next: string) {
    if (!isTableDetailTab(next)) {
      return;
    }
    setActiveTab(next);
    onTabChange?.(next);
  }
  const tableResourceName = buildTableName({
    instanceId,
    databaseId,
    schemaId: schemaName,
    tableId: tableName,
  });

  // Fetch table metadata up front so tabs can show stable resource counts.
  // The same queries back the tab panels, so counts cannot drift from content.
  const tableResourceInput = { parent: tableResourceName };
  const columnsQuery = useListTableColumnsQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const constraintsQuery = useListTableConstraintsQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const indexesQuery = useListTableIndexesQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const policiesQuery = useListTablePoliciesQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const triggersQuery = useListTableTriggersQuery(
    tableResourceInput,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const partitionMetadataQuery = useGetTablePartitionMetadataQuery(
    tableResourceName,
    TABLE_METADATA_QUERY_OPTIONS
  );
  const columnCount = columnsQuery.data?.columns.length;
  const keyRows =
    constraintsQuery.data && indexesQuery.data
      ? deriveTableKeyRows(
          constraintsQuery.data.constraints,
          indexesQuery.data.indexes
        )
      : undefined;
  const foreignKeyReferences = deriveForeignKeyReferences(
    constraintsQuery.data?.constraints
  );
  function renderOpenReferencedTableLink(
    targetTableName: string,
    onNavigate: () => void
  ) {
    const target = tryParseTableQualifiedName(targetTableName);
    if (!target) {
      return null;
    }
    return (
      <Link
        className={buttonVariants({ variant: "outline" })}
        onClick={onNavigate}
        params={{ databaseId, instanceId }}
        search={(previous) => ({
          ...previous,
          category: "tables",
          name: target.table,
          schema: target.schema,
          tab: undefined,
        })}
        to="/instances/$instanceId/databases/$databaseId/explorer"
      >
        Open table
      </Link>
    );
  }
  const tabCounts: Record<TableDetailTab, number | undefined> = {
    columns: columnCount,
    constraints: constraintsQuery.data?.constraints.length,
    data: undefined,
    definition: undefined,
    indexes: indexesQuery.data?.indexes.length,
    keys: keyRows?.length,
    partitions: partitionMetadataQuery.data
      ? derivePartitionTabCount(partitionMetadataQuery.data.partitionMetadata)
      : undefined,
    policies: policiesQuery.data?.policies.length,
    triggers: triggersQuery.data?.triggers.length,
  };
  return (
    <TableDataGrid
      foreignKeyReferences={foreignKeyReferences}
      key={tableResourceName}
      name={tableResourceName}
      renderOpenReferencedTableLink={renderOpenReferencedTableLink}
    >
      {({ grid, lastFetchedLabel }) => (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <TableDetailHeader
            columnCount={columnCount}
            lastFetchedLabel={lastFetchedLabel}
            schemaName={schemaName}
            table={table}
            tableName={tableName}
          />

          <Tabs
            className="min-h-0 w-full min-w-0 flex-1 flex-col gap-0"
            onValueChange={handleTabChange}
            value={activeTab}
          >
            <ObjectDetailTabsBar>
              {TABLE_DETAIL_TABS.map((tabDefinition) => (
                <ObjectDetailTabTrigger
                  count={tabCounts[tabDefinition.value]}
                  key={tabDefinition.value}
                  label={tabDefinition.label}
                  value={tabDefinition.value}
                />
              ))}
            </ObjectDetailTabsBar>

            <TabsContent
              className={OBJECT_DETAIL_PANEL_FILL_CLASS}
              value="data"
            >
              {/*
                Key on the table identity so switching tables remounts the grid:
                a fresh query observer drops the previous table's placeholder rows
                and shows the loading skeleton, instead of lingering on stale data.
                Same-table paging/sort/filter keeps the observer, so placeholderData
                still holds the prior page while the next loads.
                deferredTab briefly shows a skeleton so the tab switch paints
                before the grid mounts.
              */}
              {deferredTab === "data" ? (
                grid
              ) : (
                <div className="p-3">
                  <TabSkeleton />
                </div>
              )}
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="columns"
            >
              <ColumnsTab
                columnsQuery={columnsQuery}
                constraintsQuery={constraintsQuery}
                indexesQuery={indexesQuery}
              />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="keys"
            >
              <KeysTab
                constraintsQuery={constraintsQuery}
                indexesQuery={indexesQuery}
                rows={keyRows}
              />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="partitions"
            >
              <PartitionsTab query={partitionMetadataQuery} />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="indexes"
            >
              <IndexesTab
                query={indexesQuery}
                schemaName={schemaName}
                table={table}
                tableName={tableName}
              />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="constraints"
            >
              <ConstraintsTab
                databaseId={databaseId}
                instanceId={instanceId}
                query={constraintsQuery}
              />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="policies"
            >
              <PoliciesTab query={policiesQuery} />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="triggers"
            >
              <TriggersTab
                query={triggersQuery}
                schemaName={schemaName}
                tableName={tableName}
              />
            </TabsContent>
            <TabsContent
              className={OBJECT_DETAIL_PANEL_PADDED_CLASS}
              value="definition"
            >
              <DefinitionTab
                columnsQuery={columnsQuery}
                constraintsQuery={constraintsQuery}
                databaseId={databaseId}
                indexesQuery={indexesQuery}
                partitionMetadataQuery={partitionMetadataQuery}
                policiesQuery={policiesQuery}
                schemaName={schemaName}
                tableComment={table?.comment ?? ""}
                tableName={tableName}
                tableType={table?.tableType ?? Table_TableType.UNSPECIFIED}
                triggersQuery={triggersQuery}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </TableDataGrid>
  );
}

export { TableDetail };
