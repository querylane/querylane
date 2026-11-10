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

test("invalid sort directions and oversized layouts fall back without breaking other preferences", () => {
  expect(
    listColumnsSearchSchema.parse({
      columns: { roles: ["roleName"] },
      listSort: { roles: [{ id: "roleName", desc: "false" }] },
      columnOrder: { roles: Array.from({ length: 2001 }, () => "roleName") },
    })
  ).toEqual({
    columns: { roles: ["roleName"] },
    listSort: undefined,
    columnOrder: undefined,
  });
});
