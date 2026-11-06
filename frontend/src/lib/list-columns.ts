import { createContext, use, useState } from "react";
import { z } from "zod";
import {
  type ListSort,
  resolveListColumnOrder,
  resolveListSorting,
} from "@/lib/list-layout";

const MAX_COLUMN_ID_LENGTH = 100;
const MAX_LIST_KEY_LENGTH = 512;
const MAX_SELECTED_COLUMNS = 2000;
const MAX_SORT_COLUMNS = 8;

// Stable table keys, not mount order, identify independent lists on one page.
const listColumnsSearchSchema = z.object({
  columnOrder: z
    .record(
      z.string().min(1).max(MAX_LIST_KEY_LENGTH),
      z
        .array(z.string().min(1).max(MAX_COLUMN_ID_LENGTH))
        .max(MAX_SELECTED_COLUMNS)
    )
    .optional()
    .catch(undefined),
  listSort: z
    .record(
      z.string().min(1).max(MAX_LIST_KEY_LENGTH),
      z
        .array(
          z.object({
            id: z.string().min(1).max(MAX_COLUMN_ID_LENGTH),
            desc: z.boolean(),
          })
        )
        .max(MAX_SORT_COLUMNS)
    )
    .optional()
    .catch(undefined),
  columns: z
    .record(
      z.string().min(1).max(MAX_LIST_KEY_LENGTH),
      z
        .array(z.string().min(1).max(MAX_COLUMN_ID_LENGTH))
        .max(MAX_SELECTED_COLUMNS)
    )
    .optional()
    .catch(undefined),
});
type ListColumnsSearch = z.infer<typeof listColumnsSearchSchema>;
type ColumnSelections = NonNullable<ListColumnsSearch["columns"]>;
interface ColumnSelectionStore {
  layout?: {
    orders: Record<string, string[]>;
    sortings: Record<string, ListSort[]>;
    setOrder: (key: string, order: string[] | undefined) => void;
    setSorting: (key: string, sorting: ListSort[] | undefined) => void;
    resetColumns: (key: string) => void;
  };
  selections: ColumnSelections;
  setSelection: (key: string, columns: string[] | undefined) => void;
}
interface ListColumnOption {
  id: string;
  label: string;
  required?: boolean;
  sortable?: boolean;
}
const ColumnSelectionContext = createContext<ColumnSelectionStore | null>(null);

function useListColumns(key: string | undefined) {
  const store = use(ColumnSelectionContext);
  const [localSelection, setLocalSelection] = useState<string[] | undefined>();
  return {
    selection:
      key !== undefined && store !== null
        ? store.selections[key]
        : localSelection,
    setSelection: (selection: string[] | undefined) => {
      if (key !== undefined && store !== null) {
        store.setSelection(key, selection);
      } else {
        setLocalSelection(selection);
      }
    },
  };
}

function useListColumnSelection(
  key: string | undefined,
  columns: readonly ListColumnOption[]
) {
  const { selection, setSelection } = useListColumns(key);
  const layout = useListLayout(key);
  const available = columns.map((column) => column.id);
  const columnOrder = resolveListColumnOrder(layout.order, available);
  function setColumnOrder(order: string[] | undefined) {
    const next = resolveListColumnOrder(order, available);
    layout.setOrder(
      next.length === available.length &&
        next.every((id, index) => id === available[index])
        ? undefined
        : next
    );
  }
  return {
    visibleIds: resolveListColumns(
      selection,
      columnOrder,
      columns.flatMap((column) => (column.required === true ? [column.id] : []))
    ),
    setSelection,
    columnOrder,
    setColumnOrder,
    resetColumns: () => {
      if (key !== undefined && layout.resetColumns) {
        layout.resetColumns(key);
      } else {
        setSelection(undefined);
        layout.setOrder(undefined);
      }
    },
  };
}

function useListLayout(key: string | undefined) {
  const store = use(ColumnSelectionContext);
  const [order, setOrder] = useState<string[] | undefined>();
  const [sorting, setSorting] = useState<ListSort[] | undefined>();
  const layout = key === undefined ? undefined : store?.layout;
  return {
    order: layout && key !== undefined ? layout.orders[key] : order,
    sorting: layout && key !== undefined ? layout.sortings[key] : sorting,
    setOrder: (next: string[] | undefined) => {
      if (layout && key !== undefined) {
        layout.setOrder(key, next);
      } else {
        setOrder(next);
      }
    },
    setSorting: (next: ListSort[] | undefined) => {
      if (layout && key !== undefined) {
        layout.setSorting(key, next);
      } else {
        setSorting(next);
      }
    },
    resetColumns: layout?.resetColumns,
  };
}

function useListSorting(
  key: string | undefined,
  available: readonly string[],
  initial: readonly ListSort[] = []
) {
  const layout = useListLayout(key);
  const parsed = resolveListSorting(layout.sorting ?? initial, available);
  const stale =
    layout.sorting !== undefined &&
    layout.sorting.length > 0 &&
    parsed.length === 0;
  const sorting = stale ? resolveListSorting(initial, available) : parsed;
  return {
    sorting,
    setSorting: (next: ListSort[]) => {
      const normalized = resolveListSorting(next, available).slice(
        -MAX_SORT_COLUMNS
      );
      const isDefault =
        normalized.length === initial.length &&
        normalized.every(
          (sort, index) =>
            sort.id === initial[index]?.id && sort.desc === initial[index]?.desc
        );
      layout.setSorting(isDefault ? undefined : normalized);
    },
  };
}

// Stale bookmarks fall back to the defaults instead of rendering an empty list.
function resolveListColumns(
  selection: readonly string[] | undefined,
  available: readonly string[],
  required: readonly string[] = []
) {
  const availableSet = new Set(available);
  const selected = new Set(selection?.filter((id) => availableSet.has(id)));
  const requiredSet = new Set(required);
  return selected.size > 0
    ? available.filter((id) => selected.has(id) || requiredSet.has(id))
    : [...available];
}

export type { ListColumnOption };
export {
  ColumnSelectionContext,
  listColumnsSearchSchema,
  resolveListColumns,
  useListColumnSelection,
  useListColumns,
  useListLayout,
  useListSorting,
};
