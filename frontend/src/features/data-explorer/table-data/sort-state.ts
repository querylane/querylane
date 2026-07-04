import type { SortColumn } from "react-data-grid";

type SortDirection = SortColumn["direction"];

function clearColumnSort(
  sortColumns: readonly SortColumn[],
  columnKey: string
): SortColumn[] {
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
}): SortColumn[] {
  const index = sortColumns.findIndex((sort) => sort.columnKey === columnKey);
  if (index === -1) {
    // Append so sorting a new column extends an existing multi-sort instead
    // of replacing it; the controller clamps to MAX_SORT_COLUMNS.
    return [...sortColumns, { columnKey, direction }];
  }

  const next = sortColumns.slice();
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
}): SortColumn[] {
  const current = sortColumns.find((sort) => sort.columnKey === columnKey);
  if (current?.direction === direction) {
    return clearColumnSort(sortColumns, columnKey);
  }
  return setColumnSortDirection({ columnKey, direction, sortColumns });
}

export { toggleColumnSortDirection };
