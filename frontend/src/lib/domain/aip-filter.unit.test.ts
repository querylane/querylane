import { describe, expect, test } from "@rstest/core";
import {
  buildGrantFilter,
  buildOwnedFilter,
  buildRoleFilter,
} from "@/lib/domain/aip-filter";

describe("AIP filter builders", () => {
  test("combines owned-object kind and escaped name filters", () => {
    expect(
      buildOwnedFilter({ objectType: "TABLE", search: 'order"items' })
    ).toBe(
      'object_type = "TABLE" AND (object_name:"order\\"items" OR schema_name:"order\\"items")'
    );
  });

  test("scopes direct grants while keeping facets and search composable", () => {
    expect(
      buildGrantFilter({
        objectType: "VIEW",
        schemaName: "analytics",
        search: "report",
      })
    ).toBe(
      'schema_name = "analytics" AND object_type = "VIEW" AND (object_name:"report" OR schema_name:"report")'
    );
  });

  test("keeps the empty database-scope schema", () => {
    expect(buildGrantFilter({ schemaName: "", search: "" })).toBe(
      'schema_name = ""'
    );
  });

  test("maps role kinds to the backend role classification fields", () => {
    expect(buildRoleFilter({ query: " report ", type: "super" })).toBe(
      'role_name:"report" AND is_system_role = false AND attributes.is_superuser = true'
    );
    expect(buildRoleFilter({ query: "", type: "repl" })).toBe(
      "is_system_role = false AND attributes.is_superuser = false AND attributes.can_replicate = true AND attributes.can_login = true"
    );
    expect(buildRoleFilter({ query: "", type: "group" })).toBe(
      "is_system_role = false AND attributes.is_superuser = false AND attributes.can_login = false"
    );
    expect(buildRoleFilter({ query: "", type: "login" })).toBe(
      "is_system_role = false AND attributes.is_superuser = false AND attributes.can_login = true AND attributes.can_replicate = false"
    );
    expect(buildRoleFilter({ query: "", type: "builtin" })).toBe(
      "is_system_role = true"
    );
  });
});
