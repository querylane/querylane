import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import { buildRolesAccessMapModel } from "@/components/console-pages/roles-access-map-model";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  ObjectGrantSchema,
  OwnedObjectSchema,
  RoleAttributesSchema,
  RoleDefaultPrivilegeSchema,
  RoleMembershipSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

function role(
  roleName: string,
  attrs = {},
  memberOf: { role: string; roleName: string }[] = []
) {
  return create(RoleSchema, {
    attributes: create(RoleAttributesSchema, attrs),
    memberOf: memberOf.map((membership) =>
      create(RoleMembershipSchema, membership)
    ),
    name: `instances/prod/roles/${roleName}`,
    roleName,
  });
}

describe("buildRolesAccessMapModel", () => {
  test("maps role grants, ownership, and PUBLIC grants to object edges", () => {
    const model = buildRolesAccessMapModel({
      publicAccess: [
        {
          databaseId: "logistics",
          databaseName: "logistics",
          grants: [
            create(ObjectGrantSchema, {
              objectType: GrantObjectType.SCHEMA,
              privilege: "USAGE",
              schemaName: "public",
            }),
          ],
        },
      ],
      roleAccess: [
        {
          databaseId: "logistics",
          databaseName: "logistics",
          defaultPrivileges: [],
          grants: [
            create(ObjectGrantSchema, {
              objectName: "orders",
              objectType: GrantObjectType.TABLE,
              privilege: "SELECT",
              schemaName: "shipping",
            }),
          ],
          ownedObjects: [
            create(OwnedObjectSchema, {
              objectName: "logistics",
              objectType: GrantObjectType.DATABASE,
            }),
          ],
          roleId: "app_owner",
          roleName: "app_owner",
        },
      ],
      roles: [role("app_owner", { canLogin: true }), role("pg_monitor", {})],
      visibleKinds: {
        builtin: false,
        group: true,
        login: true,
        repl: true,
        super: true,
      },
    });

    expect(model.roles.map((node) => node.title)).toEqual([
      "app_owner",
      "PUBLIC",
    ]);
    expect(model.objects.map((node) => [node.title, node.subtitle])).toEqual([
      ["logistics", "database"],
      ["orders", "table · shipping"],
      ["public", "schema · logistics"],
    ]);
    expect(
      model.edges.map((edge) => [edge.source, edge.target, edge.tone])
    ).toEqual([
      ["role:app_owner", "object:database:logistics:logistics", "owner"],
      ["role:app_owner", "object:table:logistics:shipping.orders", "direct"],
      ["role:PUBLIC", "object:schema:logistics:public", "public"],
    ]);
  });

  test("filters role nodes by category visibility and search", () => {
    const model = buildRolesAccessMapModel({
      publicAccess: [],
      roleAccess: [],
      roles: [
        role("app_reader", { canLogin: true }),
        role("deploy_bot", { canLogin: true }),
        role("postgres", { canLogin: true, isSuperuser: true }),
        role("pg_read_all_data", {}),
      ],
      search: "app",
      visibleKinds: {
        builtin: false,
        group: true,
        login: true,
        repl: true,
        super: false,
      },
    });

    expect(model.roles.map((node) => node.title)).toEqual(["app_reader"]);
  });

  test("hides PUBLIC-only objects when search excludes the PUBLIC pseudo-role", () => {
    const model = buildRolesAccessMapModel({
      publicAccess: [
        {
          databaseId: "logistics",
          databaseName: "logistics",
          grants: [
            create(ObjectGrantSchema, {
              objectType: GrantObjectType.SCHEMA,
              privilege: "USAGE",
              schemaName: "public",
            }),
          ],
        },
      ],
      roleAccess: [],
      roles: [role("app_reader", { canLogin: true })],
      search: "app",
      visibleKinds: {
        builtin: false,
        group: true,
        login: true,
        repl: true,
        super: true,
      },
    });

    expect(model.roles.map((node) => node.title)).toEqual(["app_reader"]);
    expect(model.objects).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  test("maps role memberships and default privileges from the design access map", () => {
    const model = buildRolesAccessMapModel({
      publicAccess: [],
      roleAccess: [
        {
          databaseId: "logistics",
          databaseName: "logistics",
          defaultPrivileges: [
            create(RoleDefaultPrivilegeSchema, {
              creatorRole: "instances/prod/roles/app_owner",
              creatorRoleName: "app_owner",
              objectType: DefaultPrivilegeObjectType.TABLES,
              privilege: "SELECT",
              schemaName: "shipping",
            }),
          ],
          grants: [],
          ownedObjects: [],
          roleId: "app_readonly",
          roleName: "app_readonly",
        },
      ],
      roles: [
        role("app_owner", { canLogin: true }),
        role("app_readonly", { canLogin: true }, [
          {
            role: "instances/prod/roles/app_owner",
            roleName: "app_owner",
          },
        ]),
      ],
      visibleKinds: {
        builtin: true,
        group: true,
        login: true,
        repl: true,
        super: true,
      },
    });

    expect(
      model.edges.map((edge) => [
        edge.source,
        edge.target,
        edge.tone,
        edge.privileges,
      ])
    ).toEqual([
      ["role:app_readonly", "role:app_owner", "member", ["member of"]],
      [
        "role:app_owner",
        "object:schema:logistics:shipping",
        "default",
        ["default privileges: SELECT → app_readonly"],
      ],
    ]);
  });
});
