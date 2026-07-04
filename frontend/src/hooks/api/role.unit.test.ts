import { describe, expect, test } from "vitest";
import {
  publicGrantsForDatabaseQueryInput,
  roleDefaultPrivilegesForDatabaseQueryInput,
  roleGrantsForDatabaseQueryInput,
  roleOwnedObjectsForDatabaseQueryInput,
  rolesForInstanceQueryInput,
} from "@/hooks/api/role";

// Locks the canonical list inputs shared by the role detail routes so cache
// keys stay aligned across loaders and components.
describe("role query option helpers", () => {
  test("builds canonical role list input for an instance", () => {
    expect(rolesForInstanceQueryInput("local")).toEqual({
      orderBy: "name asc",
      pageSize: 1000,
      parent: "instances/local",
    });
  });

  test("builds canonical role grants input scoped to a database", () => {
    expect(
      roleGrantsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        roleId: "YWxpY2U",
      })
    ).toEqual({
      database: "instances/local/databases/postgres",
      orderBy: "schema_name asc, object_name asc, privilege asc",
      pageSize: 1000,
      parent: "instances/local/roles/YWxpY2U",
    });
  });

  // Role ids are backend base64url ids and must round-trip verbatim — see the
  // buildRoleName notes in console-resources. Percent-encoding them would
  // break backend decoding, so the segment is copied through unchanged.
  test("does not percent-encode role ids in role resource names", () => {
    expect(
      roleGrantsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        roleId: "QV9 -x",
      }).parent
    ).toBe("instances/local/roles/QV9 -x");
  });

  test("builds canonical role owned objects input scoped to a database", () => {
    expect(
      roleOwnedObjectsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        roleId: "YWxpY2U",
      })
    ).toEqual({
      database: "instances/local/databases/postgres",
      orderBy: "schema_name asc, object_name asc",
      pageSize: 1000,
      parent: "instances/local/roles/YWxpY2U",
    });
  });

  test("builds canonical role default privileges input scoped to a database", () => {
    expect(
      roleDefaultPrivilegesForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        roleId: "YWxpY2U",
      })
    ).toEqual({
      database: "instances/local/databases/postgres",
      orderBy:
        "creator_role_name asc, schema_name asc, object_type asc, privilege asc",
      pageSize: 1000,
      parent: "instances/local/roles/YWxpY2U",
    });
  });

  test("builds canonical public grants input for a database", () => {
    expect(
      publicGrantsForDatabaseQueryInput({
        databaseId: "postgres",
        instanceId: "local",
      })
    ).toEqual({
      orderBy: "schema_name asc, object_name asc, privilege asc",
      pageSize: 1000,
      parent: "instances/local/databases/postgres",
    });
  });
});
