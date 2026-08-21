import { describe, expect, test } from "@rstest/core";
import {
  type RoleGrantsTableSlice,
  selectRoleGrantsTableSlice,
} from "@/components/console-pages/role-grants-table-filter";

const DIRECT_SLICE: RoleGrantsTableSlice = {
  error: null,
  filter: 'schema_name = "public"',
  grantObjects: [],
  isPending: false,
  ownedObjects: [],
  partial: false,
  source: "direct",
};

describe("selectRoleGrantsTableSlice", () => {
  test("returns only the slice for the current source and filter", () => {
    expect(
      selectRoleGrantsTableSlice(
        DIRECT_SLICE,
        "direct",
        'schema_name = "public"'
      )
    ).toBe(DIRECT_SLICE);
    expect(
      selectRoleGrantsTableSlice(
        DIRECT_SLICE,
        "direct",
        'schema_name = "private"'
      )
    ).toBeUndefined();
    expect(
      selectRoleGrantsTableSlice(
        DIRECT_SLICE,
        "owned",
        'schema_name = "public"'
      )
    ).toBeUndefined();
  });
});
