import { SELECT_COLUMN_KEY } from "react-data-grid";
import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const ROW_KEY_FIELD = "__rowKey";
const EXPAND_COLUMN_KEY = "\u0000__expandRow";
const EXPAND_COLUMN_WIDTH = 30;
const ROW_NUMBER_KEY = "\u0000__rowNumber";
const ROW_NUMBER_COLUMN_WIDTH = 56;
const SELECT_COLUMN_WIDTH = 30;
const ROW_INDEX_KEY_PREFIX = "\u0000idx-";

interface GridRow {
  cells: Map<string, TableCell | undefined>;
  [ROW_KEY_FIELD]: string;
}

function fallbackRowKey(rowIndex: number) {
  return `${ROW_INDEX_KEY_PREFIX}${rowIndex}`;
}

/**
 * Leading columns that carry grid affordances rather than result values:
 * they are frozen first, never join a cell selection, and never export.
 */
function isGridActionColumnKey(columnKey: string) {
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
