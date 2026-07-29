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
  extension = "bin",
  rowIdentifier,
  table,
}: {
  columnName: string;
  extension?: string | undefined;
  rowIdentifier?: string | undefined;
  table: string;
}): string {
  const parts = [table, columnName];
  if (rowIdentifier !== undefined && rowIdentifier !== "") {
    parts.push(rowIdentifier.slice(0, ROW_IDENTIFIER_MAX_LENGTH));
  }
  const sanitizedParts: string[] = [];
  for (const part of parts) {
    const sanitizedPart = part.replace(SAFE_FILENAME_PATTERN, "_");
    if (sanitizedPart !== "") {
      sanitizedParts.push(sanitizedPart);
    }
  }
  const stem = sanitizedParts.join("_");
  const sanitizedExtension = extension.replaceAll(/[^a-zA-Z0-9]+/g, "");
  return `${stem === "" ? "value" : stem}.${
    sanitizedExtension === "" ? "bin" : sanitizedExtension
  }`;
}

export type { ResolvedCell };
export { buildByteaDownloadFilename, resolveEffectiveCell };
