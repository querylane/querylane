import { expect, test } from "@rstest/core";
import {
  listColumnsSearchSchema,
  resolveListColumns,
} from "@/lib/list-columns";

test("bookmarked selections tolerate stale IDs and retain required columns", () => {
  expect(
    resolveListColumns(
      ["owner", "removed"],
      ["name", "owner", "size"],
      ["name"]
    )
  ).toEqual(["name", "owner"]);
  expect(resolveListColumns(["removed"], ["name", "owner"])).toEqual([
    "name",
    "owner",
  ]);
  expect(resolveListColumns([], ["name", "owner"])).toEqual(["name", "owner"]);
});

test("malformed column state does not break the route", () => {
  for (const columns of [false, "name", ["owner"], { roles: [42] }]) {
    expect(listColumnsSearchSchema.parse({ columns }).columns).toBeUndefined();
  }
  expect(
    listColumnsSearchSchema.parse({ columns: { roles: ["roleName"] } }).columns
  ).toEqual({ roles: ["roleName"] });
});
