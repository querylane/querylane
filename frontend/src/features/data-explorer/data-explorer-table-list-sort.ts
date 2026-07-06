const TABLE_LIST_SORT_OPTIONS = ["name-asc", "size-desc", "size-asc"] as const;

type TableListSort = (typeof TABLE_LIST_SORT_OPTIONS)[number];

const TABLE_LIST_SORT_VALUES = new Set<string>(TABLE_LIST_SORT_OPTIONS);
const DEFAULT_TABLE_LIST_SORT = "name-asc" satisfies TableListSort;
const TABLE_LIST_SORT_ITEMS = [
  { label: "Name A to Z", value: "name-asc" },
  { label: "Largest first", value: "size-desc" },
  { label: "Smallest first", value: "size-asc" },
] as const satisfies readonly { label: string; value: TableListSort }[];

function isTableListSort(value: string): value is TableListSort {
  return TABLE_LIST_SORT_VALUES.has(value);
}

function tableListSortToOrderBy(sort: TableListSort): string {
  switch (sort) {
    case "name-asc":
      return "name asc";
    case "size-desc":
      return "size_bytes desc, name asc";
    case "size-asc":
      return "size_bytes asc, name asc";
    default:
      return sort satisfies never;
  }
}

export type { TableListSort };
export {
  DEFAULT_TABLE_LIST_SORT,
  isTableListSort,
  TABLE_LIST_SORT_ITEMS,
  tableListSortToOrderBy,
};
