import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const ROW_KEY_FIELD = "__rowKey";
// Reserved grid keys are namespaced with a NUL byte: PostgreSQL identifiers
// cannot contain NUL, so a result column can never collide with them.
const EXPAND_COLUMN_KEY = "\u0000__expandRow";
const EXPAND_COLUMN_WIDTH = 36;
const ROW_INDEX_KEY_PREFIX = "\u0000idx-";

interface GridRow {
  // Result cells are kept in a dedicated map keyed by PostgreSQL result
  // column name, so a column literally named "__rowKey" (or any other
  // reserved field) cannot corrupt row identity. Duplicate names collapse
  // to the last value; query aliases are required when duplicates need
  // distinct grid cells.
  cells: Map<string, TableCell | undefined>;
  [ROW_KEY_FIELD]: string;
}

// fallbackRowKey namespaces the index-based key used when the server sends
// an empty row key, so it cannot collide with a real server-provided key.
function fallbackRowKey(rowIndex: number): string {
  return `${ROW_INDEX_KEY_PREFIX}${rowIndex}`;
}

export type { GridRow };
export {
  EXPAND_COLUMN_KEY,
  EXPAND_COLUMN_WIDTH,
  fallbackRowKey,
  ROW_KEY_FIELD,
};
