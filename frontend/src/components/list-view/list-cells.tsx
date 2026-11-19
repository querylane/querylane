import { Fragment, type ReactNode } from "react";

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
