const TABLE_DETAIL_TAB_VALUES = [
  "data",
  "columns",
  "keys",
  "partitions",
  "indexes",
  "constraints",
  "policies",
  "triggers",
  "definition",
] as const;

type TableDetailTab = (typeof TABLE_DETAIL_TAB_VALUES)[number];

function isTableDetailTab(value: string | undefined): value is TableDetailTab {
  return TABLE_DETAIL_TAB_VALUES.includes(value as TableDetailTab);
}

export type { TableDetailTab };
export { isTableDetailTab, TABLE_DETAIL_TAB_VALUES };
