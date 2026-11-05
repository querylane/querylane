import type { SortingState } from "@tanstack/react-table";
import { z } from "zod";

const roleSortValues = z.enum([
  "none",
  "roleName:asc",
  "roleName:desc",
  "connLimit:asc",
  "connLimit:desc",
]);
const databaseSortValues = z.enum([
  "none",
  "name:asc",
  "name:desc",
  "owner:asc",
  "owner:desc",
  "encoding:asc",
  "encoding:desc",
  "kind:asc",
  "kind:desc",
]);
const rolesSortSchema = z
  .unknown()
  .transform((value): string | undefined => {
    const parsed = roleSortValues.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  })
  .optional();
const databasesSortSchema = z
  .unknown()
  .transform((value): string | undefined => {
    const parsed = databaseSortValues.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  })
  .optional();
const instanceDatabasesSearchSchema = z.object({ sort: databasesSortSchema });

function metadataSorting(
  value: string | undefined,
  defaultColumn?: string
): SortingState {
  if (value === "none") {
    return [];
  }
  if (value === undefined) {
    return defaultColumn !== undefined && defaultColumn !== ""
      ? [{ id: defaultColumn, desc: false }]
      : [];
  }
  const [id, direction] = value.split(":");
  return id !== undefined &&
    id !== "" &&
    (direction === "asc" || direction === "desc")
    ? [{ id, desc: direction === "desc" }]
    : [];
}
function metadataSortParam(sorting: SortingState): string {
  const [first] = sorting;
  return first ? `${first.id}:${first.desc ? "desc" : "asc"}` : "none";
}

export {
  databasesSortSchema,
  instanceDatabasesSearchSchema,
  metadataSorting,
  metadataSortParam,
  rolesSortSchema,
};
