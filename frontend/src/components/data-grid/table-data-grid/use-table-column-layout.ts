import { useEffect } from "react";
import {
  reorderVisibleTableColumns,
  resolveSelectedColumns,
  resolveTableColumnLayout,
  useTableColumnLayoutSettingsStore,
} from "@/features/user-settings/table-column-layout-settings";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface UseTableColumnLayoutOptions {
  availableColumns: TableResultColumn[];
  columns: TableResultColumn[];
  hasColumnMetadata: boolean;
  tableName: string;
}

function useSelectedTableColumns(tableName: string): string[] {
  const savedLayout = useTableColumnLayoutSettingsStore(
    (state) => state.layouts[tableName]
  );
  return resolveSelectedColumns(savedLayout);
}

function useTableColumnLayout({
  availableColumns,
  columns,
  hasColumnMetadata,
  tableName,
}: UseTableColumnLayoutOptions) {
  const savedLayout = useTableColumnLayoutSettingsStore(
    (state) => state.layouts[tableName]
  );
  const reconcileLayout = useTableColumnLayoutSettingsStore(
    (state) => state.reconcileLayout
  );
  const resetLayout = useTableColumnLayoutSettingsStore(
    (state) => state.resetLayout
  );
  const setLayout = useTableColumnLayoutSettingsStore(
    (state) => state.setLayout
  );
  const availableColumnNames = availableColumns.map(
    (column) => column.columnName
  );
  const layout = resolveTableColumnLayout(availableColumnNames, savedLayout);
  const hiddenColumnKeys = new Set(layout.hiddenColumns);
  const columnByName = new Map(
    columns.map((column) => [column.columnName, column])
  );
  const displayColumns = layout.order.flatMap((columnName) => {
    const column = columnByName.get(columnName);
    return column && !hiddenColumnKeys.has(columnName) ? [column] : [];
  });

  useEffect(
    function reconcileSavedLayout() {
      if (!hasColumnMetadata) {
        return;
      }
      reconcileLayout(tableName, availableColumnNames);
    },
    [availableColumnNames, hasColumnMetadata, reconcileLayout, tableName]
  );

  function nextProjectionSetting() {
    return layout.fetchVisibleColumns
      ? ({ fetchVisibleColumns: true } as const)
      : {};
  }

  function setColumnVisibility(columnKey: string, visible: boolean) {
    const nextHiddenColumns = new Set(hiddenColumnKeys);
    if (visible) {
      nextHiddenColumns.delete(columnKey);
    } else {
      nextHiddenColumns.add(columnKey);
    }
    setLayout(tableName, {
      ...nextProjectionSetting(),
      hiddenColumns: layout.order.filter((columnName) =>
        nextHiddenColumns.has(columnName)
      ),
      order: layout.order,
    });
  }

  function setColumnOrder(order: string[]) {
    setLayout(tableName, {
      ...nextProjectionSetting(),
      hiddenColumns: layout.hiddenColumns,
      order,
    });
  }

  function setFetchVisibleColumns(enabled: boolean) {
    setLayout(tableName, {
      ...(enabled ? { fetchVisibleColumns: true as const } : {}),
      hiddenColumns: layout.hiddenColumns,
      order: layout.order,
    });
  }

  function reorderColumns(sourceColumnKey: string, targetColumnKey: string) {
    setColumnOrder(
      reorderVisibleTableColumns({
        hiddenColumns: layout.hiddenColumns,
        order: layout.order,
        sourceColumnKey,
        targetColumnKey,
      })
    );
  }

  return {
    columnOrder: layout.order,
    displayColumns,
    fetchVisibleColumns: layout.fetchVisibleColumns ?? false,
    hiddenColumnKeys,
    isCustomized: savedLayout !== undefined,
    reorderColumns,
    reset: () => resetLayout(tableName),
    setColumnOrder,
    setColumnVisibility,
    setFetchVisibleColumns,
  };
}

export { useSelectedTableColumns, useTableColumnLayout };
