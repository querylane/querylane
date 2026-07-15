import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface TableColumnLayout {
  hiddenColumns: string[];
  order: string[];
}

interface TableColumnLayoutSettingsState {
  layouts: Record<string, TableColumnLayout>;
  reconcileLayout: (tableName: string, columns: readonly string[]) => void;
  resetLayout: (tableName: string) => void;
  setLayout: (tableName: string, layout: TableColumnLayout) => void;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    ),
  ];
}

function parsePersistedLayouts(
  value: unknown
): Record<string, TableColumnLayout> {
  if (!(isObjectRecord(value) && isObjectRecord(value["layouts"]))) {
    return {};
  }
  const layouts: Record<string, TableColumnLayout> = {};
  for (const [tableName, candidate] of Object.entries(value["layouts"])) {
    if (!(tableName && isObjectRecord(candidate))) {
      continue;
    }
    const hiddenColumns = parseStringArray(candidate["hiddenColumns"]);
    const order = parseStringArray(candidate["order"]);
    if (!(hiddenColumns && order)) {
      continue;
    }
    layouts[tableName] = { hiddenColumns, order };
  }
  return layouts;
}

function uniqueKnownColumns(
  columns: readonly string[],
  knownColumns: ReadonlySet<string>
): string[] {
  return [...new Set(columns)].filter((column) => knownColumns.has(column));
}

function resolveTableColumnLayout(
  columns: readonly string[],
  savedLayout?: TableColumnLayout | undefined
): TableColumnLayout {
  const knownColumns = new Set(columns);
  const savedOrder = uniqueKnownColumns(savedLayout?.order ?? [], knownColumns);
  const savedOrderSet = new Set(savedOrder);
  const orderedColumns = [
    ...savedOrder,
    ...columns.filter((column) => !savedOrderSet.has(column)),
  ];
  const savedHiddenColumns = uniqueKnownColumns(
    savedLayout?.hiddenColumns ?? [],
    knownColumns
  );
  const [firstColumn] = orderedColumns;
  const hiddenColumns =
    firstColumn && savedHiddenColumns.length === orderedColumns.length
      ? savedHiddenColumns.filter((column) => column !== firstColumn)
      : savedHiddenColumns;

  return {
    hiddenColumns,
    order: orderedColumns,
  };
}

function layoutsMatch(
  first: TableColumnLayout,
  second: TableColumnLayout
): boolean {
  return (
    first.order.join("\0") === second.order.join("\0") &&
    first.hiddenColumns.join("\0") === second.hiddenColumns.join("\0")
  );
}

function reorderVisibleTableColumns(
  order: readonly string[],
  hiddenColumns: readonly string[],
  sourceColumnKey: string,
  targetColumnKey: string
): string[] {
  const hiddenColumnKeys = new Set(hiddenColumns);
  const visibleOrder = order.filter(
    (columnName) => !hiddenColumnKeys.has(columnName)
  );
  const sourceIndex = visibleOrder.indexOf(sourceColumnKey);
  const targetIndex = visibleOrder.indexOf(targetColumnKey);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return order.slice();
  }
  const [sourceColumn] = visibleOrder.splice(sourceIndex, 1);
  if (!sourceColumn) {
    return order.slice();
  }
  visibleOrder.splice(targetIndex, 0, sourceColumn);

  let visibleIndex = 0;
  return order.map((columnName) => {
    if (hiddenColumnKeys.has(columnName)) {
      return columnName;
    }
    const reorderedColumn = visibleOrder[visibleIndex] ?? columnName;
    visibleIndex += 1;
    return reorderedColumn;
  });
}

const useTableColumnLayoutSettingsStore =
  create<TableColumnLayoutSettingsState>()(
    persist(
      (set) => ({
        layouts: {},
        reconcileLayout: (tableName, columns) =>
          set((state) => {
            const current = state.layouts[tableName];
            if (!current) {
              return state;
            }
            const next = resolveTableColumnLayout(columns, current);
            if (layoutsMatch(current, next)) {
              return state;
            }
            return {
              layouts: { ...state.layouts, [tableName]: next },
            };
          }),
        resetLayout: (tableName) =>
          set((state) => {
            const layouts = { ...state.layouts };
            delete layouts[tableName];
            return { layouts };
          }),
        setLayout: (tableName, layout) =>
          set((state) => ({
            layouts: { ...state.layouts, [tableName]: layout },
          })),
      }),
      {
        merge: (persisted, current) => ({
          ...current,
          layouts: parsePersistedLayouts(persisted),
        }),
        name: "querylane-table-column-layouts",
        partialize: (state) => ({ layouts: state.layouts }),
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    )
  );

export type { TableColumnLayout };
export {
  reorderVisibleTableColumns,
  resolveTableColumnLayout,
  useTableColumnLayoutSettingsStore,
};
