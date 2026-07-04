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

export type { ResolvedCell };
export { resolveEffectiveCell };
