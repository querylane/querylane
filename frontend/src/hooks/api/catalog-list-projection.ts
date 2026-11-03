import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";

// These lists also feed navigation, facet options, maps and summary totals.
// Their union of dependencies must remain available even when a cell is hidden.
// Keep masks in the shared input builders so preload and observer keys agree.
const DATABASE_LIST_READ_MASK = create(FieldMaskSchema, {
  paths: [
    "character_set",
    "collation",
    "display_name",
    "is_system_database",
    "name",
    "owner",
  ],
});
const SCHEMA_LIST_READ_MASK = create(FieldMaskSchema, {
  paths: ["display_name", "is_system_schema", "last_ddl_time", "name", "owner"],
});
const TABLE_LIST_READ_MASK = create(FieldMaskSchema, {
  paths: [
    "comment",
    "display_name",
    "is_system_table",
    "last_ddl_time",
    "name",
    "owner",
    "row_count",
    "size_bytes",
    "table_type",
  ],
});

export { DATABASE_LIST_READ_MASK, SCHEMA_LIST_READ_MASK, TABLE_LIST_READ_MASK };
