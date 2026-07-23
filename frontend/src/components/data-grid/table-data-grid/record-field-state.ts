import type { TableCell } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface ResolvedCell {
  cell: TableCell;
  fullValueToken: string;
}

function resolveEffectiveCell(
  cell: TableCell | undefined,
  resolved: ResolvedCell | undefined
): TableCell | undefined {
  const fullValueToken = cell?.fullValueToken ?? "";
  if (fullValueToken !== "" && resolved?.fullValueToken === fullValueToken) {
    return resolved.cell;
  }
  return cell;
}

const SAFE_FILENAME_PATTERN = /[^a-zA-Z0-9_.-]+/g;
const ROW_IDENTIFIER_MAX_LENGTH = 40;

function buildByteaDownloadFilename({
  columnName,
  rowIdentifier,
  table,
}: {
  columnName: string;
  rowIdentifier?: string | undefined;
  table: string;
}): string {
  const parts = [table, columnName];
  if (rowIdentifier !== undefined && rowIdentifier !== "") {
    parts.push(rowIdentifier.slice(0, ROW_IDENTIFIER_MAX_LENGTH));
  }
  const stem = parts
    .map((part) => part.replace(SAFE_FILENAME_PATTERN, "_"))
    .filter((part) => part !== "")
    .join("_");
  return `${stem === "" ? "value" : stem}.bin`;
}

export type { ResolvedCell };
export { buildByteaDownloadFilename, resolveEffectiveCell };
