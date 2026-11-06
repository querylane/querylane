import { Fragment, type ReactNode } from "react";

// Headers, body and totals consume the same ordered column IDs. This keeps
// custom ledgers' real DOM order (not just CSS order) aligned for assistive tech.
function ListCells({
  order,
  cells,
}: {
  order: readonly string[];
  cells: Record<string, ReactNode>;
}) {
  return order.map((id) => <Fragment key={id}>{cells[id]}</Fragment>);
}

export { ListCells };
