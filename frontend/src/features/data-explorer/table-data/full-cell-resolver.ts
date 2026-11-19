import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const READ_CELL_MAX_BYTES = 67_108_864n;

type FetchFullCell = (fullValueToken: string) => Promise<TableCell | undefined>;

function cellNeedsFullValue(cell: TableCell | undefined) {
  return cell?.truncated === true && cell.fullValueToken !== "";
}

async function resolveFullCell(
  cell: TableCell | undefined,
  fetchFullCell: FetchFullCell
) {
  if (!(cell && cellNeedsFullValue(cell))) {
    return cell;
  }
  const full = await fetchFullCell(cell.fullValueToken);
  if (!full || full.truncated) {
    throw new Error("Value exceeds the maximum fetchable size");
  }
  return full;
}

async function resolveRowCells(
  cells: Map<string, TableCell | undefined>,
  fetchFullCell: FetchFullCell
) {
  const entries = await Promise.all(
    [...cells.entries()].map(
      async ([columnName, cell]) =>
        [columnName, await resolveFullCell(cell, fetchFullCell)] as const
    )
  );
  return new Map(entries);
}

export {
  cellNeedsFullValue,
  type FetchFullCell,
  READ_CELL_MAX_BYTES,
  resolveFullCell,
  resolveRowCells,
};
