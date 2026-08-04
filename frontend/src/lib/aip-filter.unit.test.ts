import { describe, expect, it } from "vitest";
import {
  buildContainsFilter,
  buildGrantFilter,
  buildOwnedFilter,
  buildRoleFilter,
  quoteFilterValue,
} from "@/lib/aip-filter";

describe("AIP filter builders", () => {
  it("quotes a user value as one escaped filter literal", () => {
    expect(
      quoteFilterValue(String.raw`report\" AND is_system_role = true`)
    ).toBe(String.raw`"report\\\" AND is_system_role = true"`);
  });

  it("skips substring scans until two trimmed characters are present", () => {
    expect(buildContainsFilter("name", " a ")).toBeUndefined();
    expect(buildContainsFilter("name", " ab ")).toBe('name:"ab"');
  });

  it("combines owned-object kind and escaped name filters", () => {
    expect(
      buildOwnedFilter({ objectType: "TABLE", search: 'order"items' })
    ).toBe(
      'object_type = "TABLE" AND (object_name:"order\\"items" OR schema_name:"order\\"items")'
    );
  });

  it("scopes direct grants while keeping facets and search composable", () => {
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

  it("keeps the empty database-scope schema", () => {
    expect(buildGrantFilter({ schemaName: "", search: "" })).toBe(
      'schema_name = ""'
    );
  });

  it("maps role kinds to the backend role classification fields", () => {
    expect(buildRoleFilter({ query: " report ", type: "super" })).toBe(
      'name:"report" AND is_system_role = false AND is_superuser = true'
    );
    expect(buildRoleFilter({ query: "", type: "repl" })).toBe(
      "is_system_role = false AND is_superuser = false AND can_replicate = true AND can_login = true"
    );
    expect(buildRoleFilter({ query: "", type: "group" })).toBe(
      "is_system_role = false AND is_superuser = false AND can_login = false"
    );
    expect(buildRoleFilter({ query: "", type: "login" })).toBe(
      "is_system_role = false AND is_superuser = false AND can_login = true AND can_replicate = false"
    );
    expect(buildRoleFilter({ query: "", type: "builtin" })).toBe(
      "is_system_role = true"
    );
  });
});
