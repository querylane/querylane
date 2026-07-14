import { useEffect } from "react";
import {
  reorderVisibleTableColumns,
  resolveTableColumnLayout,
  useTableColumnLayoutSettingsStore,
} from "@/features/user-settings/table-column-layout-settings";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface UseTableColumnLayoutOptions {
  columns: TableResultColumn[];
  hasResultSet: boolean;
  tableName: string;
}

function useTableColumnLayout({
  columns,
  hasResultSet,
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
  const layout = resolveTableColumnLayout(
    columns.map((column) => column.columnName),
    savedLayout
  );
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
      if (!hasResultSet) {
        return;
      }
      reconcileLayout(
        tableName,
        columns.map((column) => column.columnName)
      );
    },
    [columns, hasResultSet, reconcileLayout, tableName]
  );

  function setColumnVisibility(columnKey: string, visible: boolean) {
    const nextHiddenColumns = new Set(hiddenColumnKeys);
    if (visible) {
      nextHiddenColumns.delete(columnKey);
    } else {
      nextHiddenColumns.add(columnKey);
    }
    setLayout(tableName, {
      hiddenColumns: layout.order.filter((columnName) =>
        nextHiddenColumns.has(columnName)
      ),
      order: layout.order,
    });
  }

  function setColumnOrder(order: string[]) {
    setLayout(tableName, {
      hiddenColumns: layout.hiddenColumns,
      order,
    });
  }

  function reorderColumns(sourceColumnKey: string, targetColumnKey: string) {
    setColumnOrder(
      reorderVisibleTableColumns(
        layout.order,
        layout.hiddenColumns,
        sourceColumnKey,
        targetColumnKey
      )
    );
  }

  return {
    columnOrder: layout.order,
    displayColumns,
    hiddenColumnKeys,
    isCustomized: savedLayout !== undefined,
    reorderColumns,
    reset: () => resetLayout(tableName),
    setColumnOrder,
    setColumnVisibility,
  };
}

export { useTableColumnLayout };
