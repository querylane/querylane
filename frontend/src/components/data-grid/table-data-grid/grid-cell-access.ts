import type { GridRow } from "@/components/data-grid/table-data-grid/grid-row-model";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

function getGridCell(
  row: GridRow,
  column: TableResultColumn
): TableCell | undefined {
  return row.cells.get(column.columnName);
}

function setGridCell(
  row: GridRow,
  column: TableResultColumn,
  cell: TableCell | undefined
) {
  row.cells.set(column.columnName, cell);
}

export { getGridCell, setGridCell };
