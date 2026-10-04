import { SELECT_COLUMN_KEY } from "react-data-grid";
import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const ROW_KEY_FIELD = "__rowKey";
// Reserved grid keys are namespaced with a NUL byte: PostgreSQL identifiers
// cannot contain NUL, so a result column can never collide with them.
const EXPAND_COLUMN_KEY = "\u0000__expandRow";
const EXPAND_COLUMN_WIDTH = 30;
// Optional leading row-number column (query results, which have no stable
// row identity to show instead).
const ROW_NUMBER_KEY = "\u0000__rowNumber";
const ROW_NUMBER_COLUMN_WIDTH = 56;
const SELECT_COLUMN_WIDTH = 30;
const ROW_INDEX_KEY_PREFIX = "\u0000idx-";

interface GridRow {
  // Result cells are kept in a dedicated map keyed by result column name,
  // so a column literally named "__rowKey" (or any other reserved field)
  // cannot corrupt row identity. Names must therefore be unique: table
  // columns are, and query results disambiguate repeats before they reach
  // the grid (see SqlResultsGrid).
  cells: Map<string, TableCell | undefined>;
  [ROW_KEY_FIELD]: string;
}

// fallbackRowKey namespaces the index-based key used when the server sends
// an empty row key, so it cannot collide with a real server-provided key.
function fallbackRowKey(rowIndex: number): string {
  return `${ROW_INDEX_KEY_PREFIX}${rowIndex}`;
}

/**
 * Leading columns that carry grid affordances rather than result values:
 * they are frozen first, never join a cell selection, and never export.
 */
function isGridActionColumnKey(columnKey: string): boolean {
  return (
    columnKey === SELECT_COLUMN_KEY ||
    columnKey === EXPAND_COLUMN_KEY ||
    columnKey === ROW_NUMBER_KEY
  );
}

export type { GridRow };
export {
  EXPAND_COLUMN_KEY,
  EXPAND_COLUMN_WIDTH,
  fallbackRowKey,
  isGridActionColumnKey,
  ROW_KEY_FIELD,
  ROW_NUMBER_COLUMN_WIDTH,
  ROW_NUMBER_KEY,
  SELECT_COLUMN_WIDTH,
};
