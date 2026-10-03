import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "@rstest/core";
import { uniqueColumns } from "@/features/sql-workbench/sql-result-columns";
import { TableResultColumnSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

function column(columnName: string) {
  return create(TableResultColumnSchema, { columnName, rawType: "int4" });
}

describe("uniqueColumns", () => {
  it("gives repeated names the export's keys so every cell stays addressable", () => {
    const columns = [column("id"), column("name"), column("id"), column("id")];
    expect(uniqueColumns(columns).map((entry) => entry.columnName)).toEqual([
      "id",
      "name",
      "id#1",
      "id#2",
    ]);
  });

  it("passes distinct columns through untouched", () => {
    const columns = [column("id"), column("name")];
    const unique = uniqueColumns(columns);
    expect(unique[0]).toBe(columns[0]);
    expect(unique[1]).toBe(columns[1]);
  });
});
