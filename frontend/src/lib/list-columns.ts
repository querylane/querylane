import { createContext, use, useState } from "react";
import { z } from "zod";

const MAX_COLUMN_ID_LENGTH = 100;
const MAX_LIST_KEY_LENGTH = 512;
const MAX_SELECTED_COLUMNS = 2000;

// Stable table keys, not mount order, identify independent lists on one page.
const listColumnsSearchSchema = z.object({
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
  selections: ColumnSelections;
  setSelection: (key: string, columns: string[] | undefined) => void;
}
interface ListColumnOption {
  id: string;
  label: string;
  required?: boolean;
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
  return {
    visibleIds: resolveListColumns(
      selection,
      columns.map((column) => column.id),
      columns.flatMap((column) => (column.required === true ? [column.id] : []))
    ),
    setSelection,
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
};
