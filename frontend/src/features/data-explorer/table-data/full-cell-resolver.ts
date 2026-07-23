import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

// ReadCellValue's server-side hard cap (64 MiB). Values larger than this
// cannot be fetched in full through the RPC at all.
const READ_CELL_MAX_BYTES = 67_108_864n;

type FetchFullCell = (fullValueToken: string) => Promise<TableCell | undefined>;

function cellNeedsFullValue(cell: TableCell | undefined): boolean {
  return cell?.truncated === true && cell.fullValueToken !== "";
}

// resolveFullCell swaps a truncated preview cell for its complete value
// via ReadCellValue. Cells that are already complete (or truncated without
// a token — nothing we can do) pass through untouched. Throws when the
// fetched cell is missing or still truncated so callers surface an error
// instead of silently copying a prefix.
async function resolveFullCell(
  cell: TableCell | undefined,
  fetchFullCell: FetchFullCell
): Promise<TableCell | undefined> {
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
): Promise<Map<string, TableCell | undefined>> {
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
