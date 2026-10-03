import { useEffect } from "react";
import {
  reorderVisibleTableColumns,
  resolveSelectedColumns,
  resolveTableColumnLayout,
  useTableColumnLayoutSettingsStore,
} from "@/features/user-settings/table-column-layout-settings";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/** What the result grid needs from a column layout, persisted or not. */
interface TableColumnLayoutController {
  columnOrder: readonly string[];
  displayColumns: TableResultColumn[];
  fetchVisibleColumns: boolean;
  hiddenColumnKeys: ReadonlySet<string>;
  isCustomized: boolean;
  reorderColumns: (sourceColumnKey: string, targetColumnKey: string) => void;
  reset: () => void;
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (columnKey: string, visible: boolean) => void;
  /** Absent when rows are not fetched by column (no projection toggle). */
  setFetchVisibleColumns?: ((enabled: boolean) => void) | undefined;
}

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
}: UseTableColumnLayoutOptions): TableColumnLayoutController {
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
  const hasColumnCustomization =
    layout.hiddenColumns.length > 0 ||
    layout.order.length !== availableColumnNames.length ||
    layout.order.some(
      (columnName, index) => columnName !== availableColumnNames[index]
    );

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
    if (!(enabled || hasColumnCustomization)) {
      resetLayout(tableName);
      return;
    }
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
    isCustomized: Boolean(layout.fetchVisibleColumns) || hasColumnCustomization,
    reorderColumns,
    reset: () => resetLayout(tableName),
    setColumnOrder,
    setColumnVisibility,
    setFetchVisibleColumns,
  };
}

const NO_HIDDEN_COLUMNS: ReadonlySet<string> = new Set();

function ignoreLayoutChange() {
  // Static layouts have no column controls to call this.
}

/**
 * The layout of a grid that offers no column controls (query results): the
 * columns exactly as returned, in order, none hidden. The setters are never
 * reachable from the UI there.
 */
function staticColumnLayout(
  columns: readonly TableResultColumn[]
): TableColumnLayoutController {
  return {
    columnOrder: columns.map((column) => column.columnName),
    displayColumns: [...columns],
    fetchVisibleColumns: false,
    hiddenColumnKeys: NO_HIDDEN_COLUMNS,
    isCustomized: false,
    reorderColumns: ignoreLayoutChange,
    reset: ignoreLayoutChange,
    setColumnOrder: ignoreLayoutChange,
    setColumnVisibility: ignoreLayoutChange,
  };
}

export type { TableColumnLayoutController };
export { staticColumnLayout, useSelectedTableColumns, useTableColumnLayout };
