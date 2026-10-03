import { create } from "@bufbuild/protobuf";
import { resultColumnKeys } from "@/features/data-explorer/table-data/selection-formatters";
import {
  type TableResultColumn,
  TableResultColumnSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/**
 * The shared grid keys cells by column name. A query can return the same
 * name twice (`SELECT a.id, b.id`), so later duplicates are shown under the
 * export's disambiguated keys (`id#1`); an alias gives them a real name.
 */
function uniqueColumns(columns: readonly TableResultColumn[]) {
  const keys = resultColumnKeys(columns);
  return columns.map((column, index) => {
    const key = keys[index] ?? column.columnName;
    return key === column.columnName
      ? column
      : create(TableResultColumnSchema, { ...column, columnName: key });
  });
}

export { uniqueColumns };
