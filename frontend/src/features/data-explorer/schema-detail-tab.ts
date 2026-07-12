const SCHEMA_DETAIL_TAB_VALUES = ["objects", "map"] as const;

type SchemaDetailTab = (typeof SCHEMA_DETAIL_TAB_VALUES)[number];

function isSchemaDetailTab(
  value: string | undefined
): value is SchemaDetailTab {
  return SCHEMA_DETAIL_TAB_VALUES.includes(value as SchemaDetailTab);
}

export type { SchemaDetailTab };
export { isSchemaDetailTab, SCHEMA_DETAIL_TAB_VALUES };
