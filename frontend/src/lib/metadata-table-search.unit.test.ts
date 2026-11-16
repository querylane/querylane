import { expect, test } from "@rstest/core";
import { instanceDatabasesSearchSchema } from "@/lib/metadata-table-search";

test("database sorting accepts only metadata columns and ascending or descending directions", () => {
  expect(instanceDatabasesSearchSchema.parse({ sort: "owner:asc" })).toEqual({
    sort: "owner:asc",
  });
  expect(
    instanceDatabasesSearchSchema.parse({ sort: "encoding:desc" })
  ).toEqual({ sort: "encoding:desc" });
  expect(instanceDatabasesSearchSchema.parse({ sort: "kind:asc" })).toEqual({
    sort: "kind:asc",
  });
  expect(instanceDatabasesSearchSchema.parse({ sort: "none" })).toEqual({
    sort: "none",
  });
  for (const sort of [
    "roleName:asc",
    "name:up",
    "name:asc,owner:desc",
    { id: "name", desc: false },
  ]) {
    expect(instanceDatabasesSearchSchema.parse({ sort })).toEqual({
      sort: undefined,
    });
  }
});
