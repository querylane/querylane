import { describe, expect, test } from "vitest";
import { buildAccessMapModel } from "@/features/database-visualization/access-map-model";

describe("buildAccessMapModel", () => {
  test("builds selected role access graph with membership, grants, owners, defaults, and public", () => {
    const model = buildAccessMapModel({
      databaseName: "postgres",
      defaultPrivileges: [
        {
          creatorRoleName: "app_owner",
          objectType: "tables",
          privilege: "SELECT",
          schemaName: "public",
          withGrantOption: false,
        },
      ],
      directGrants: [
        {
          objectName: "orders",
          objectType: "table",
          privilege: "SELECT",
          schemaName: "public",
          withGrantOption: false,
        },
      ],
      members: [{ roleId: "app_reader", roleName: "app_reader" }],
      ownedObjects: [
        {
          objectName: "orders",
          objectType: "table",
          privilege: "OWNER",
          schemaName: "public",
          withGrantOption: false,
        },
      ],
      parentRoles: [
        { roleId: "pg_read_all_data", roleName: "pg_read_all_data" },
      ],
      publicGrants: [
        {
          objectName: "",
          objectType: "schema",
          privilege: "USAGE",
          schemaName: "public",
          withGrantOption: false,
        },
        {
          objectName: "",
          objectType: "schema",
          privilege: "CREATE",
          schemaName: "public",
          withGrantOption: true,
        },
      ],
      role: {
        attributes: { bypassesRls: true, canLogin: true, isSuperuser: false },
        roleId: "app_user",
        roleName: "app_user",
      },
    });

    expect(model.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "role:app_user",
        "parent:pg_read_all_data",
        "member:app_reader",
        "object:table:public.orders",
        "owned:table:public.orders",
        "defaults:app_owner:tables:public:SELECT",
        "public:schema:public",
      ])
    );
    const publicNode = model.nodes.find(
      (node) => node.id === "public:schema:public"
    );
    expect(publicNode).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          badges: ["PUBLIC", "SCHEMA"],
          lines: ["USAGE", "CREATE with grant option"],
          title: "public",
        }),
      })
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "role:app_user",
          target: "parent:pg_read_all_data",
        }),
        expect.objectContaining({
          source: "member:app_reader",
          target: "role:app_user",
        }),
        expect.objectContaining({
          label: "SELECT",
          source: "role:app_user",
          target: "object:table:public.orders",
        }),
        expect.objectContaining({
          label: "owns",
          source: "role:app_user",
          target: "owned:table:public.orders",
        }),
        expect.objectContaining({
          label: "PUBLIC USAGE",
          source: "public:schema:public",
          target: "role:app_user",
        }),
        expect.objectContaining({
          label: "PUBLIC CREATE",
          source: "public:schema:public",
          target: "role:app_user",
        }),
      ])
    );
    expect(model.summary).toMatchObject({
      bypassesRls: true,
      directGrantCount: 1,
      ownedObjectCount: 1,
      publicGrantCount: 2,
    });
  });

  test("aggregates default privileges that only differ by grant option", () => {
    const model = buildAccessMapModel({
      databaseName: "postgres",
      defaultPrivileges: [
        {
          creatorRoleName: "app_owner",
          objectType: "tables",
          privilege: "SELECT",
          schemaName: "public",
          withGrantOption: false,
        },
        {
          creatorRoleName: "app_owner",
          objectType: "tables",
          privilege: "SELECT",
          schemaName: "public",
          withGrantOption: true,
        },
      ],
      directGrants: [],
      members: [],
      ownedObjects: [],
      parentRoles: [],
      publicGrants: [],
      role: {
        attributes: { bypassesRls: false, canLogin: true, isSuperuser: false },
        roleId: "app_user",
        roleName: "app_user",
      },
    });

    const defaultNodes = model.nodes.filter((node) =>
      node.id.startsWith("defaults:app_owner:tables:public:SELECT")
    );
    const defaultEdges = model.edges.filter((edge) =>
      edge.id.startsWith("defaults:app_owner:tables:public:SELECT->role:")
    );

    expect(defaultNodes).toHaveLength(1);
    expect(defaultNodes[0]?.data.lines).toEqual([
      "app_owner future tables",
      "Schema public",
      "Without grant option",
      "With grant option",
    ]);
    expect(defaultEdges).toHaveLength(1);
  });
});
