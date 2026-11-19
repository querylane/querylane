import type { SortColumn } from "react-data-grid";

type SortDirection = SortColumn["direction"];

function clearColumnSort(
  sortColumns: readonly SortColumn[],
  columnKey: string
) {
  return sortColumns.filter((sort) => sort.columnKey !== columnKey);
}

function setColumnSortDirection({
  columnKey,
  direction,
  sortColumns,
}: {
  columnKey: string;
  direction: SortDirection;
  sortColumns: readonly SortColumn[];
}) {
  const index = sortColumns.findIndex((sort) => sort.columnKey === columnKey);
  if (index === -1) {
    return [...sortColumns, { columnKey, direction }] satisfies SortColumn[];
  }

  const next = [...sortColumns];
  next[index] = { columnKey, direction };
  return next;
}

function toggleColumnSortDirection({
  columnKey,
  direction,
  sortColumns,
}: {
  columnKey: string;
  direction: SortDirection;
  sortColumns: readonly SortColumn[];
}) {
  const current = sortColumns.find((sort) => sort.columnKey === columnKey);
  if (current?.direction === direction) {
    return clearColumnSort(sortColumns, columnKey);
  }
  return setColumnSortDirection({ columnKey, direction, sortColumns });
}

export { toggleColumnSortDirection };
