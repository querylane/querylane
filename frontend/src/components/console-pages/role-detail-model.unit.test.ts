import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, test } from "vitest";
import {
  buildAccessRows,
  builtinDetailText,
  type Capability,
  capabilities,
  connLimitDisplay,
  deriveBuiltinParents,
  directGrantsSubText,
  facetStateOf,
  isSection,
  ownedSubText,
  type RelatedRole,
  rlsNoteText,
  shouldLoadRoleFacets,
} from "@/components/console-pages/role-detail-model";
import type { GrantedObject } from "@/components/console-pages/role-grants-shared";
import { predefinedRoleInfo } from "@/lib/role-display";
import {
  GrantObjectType,
  type RoleAttributes,
  RoleAttributesSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

function attributes(
  init: MessageInitShape<typeof RoleAttributesSchema>
): RoleAttributes {
  return create(RoleAttributesSchema, init);
}

function capabilityByKeyword(list: Capability[], keyword: string): Capability {
  const found = list.find((capability) => capability.keyword === keyword);
  if (!found) {
    throw new Error(`missing capability ${keyword}`);
  }
  return found;
}

describe("isSection", () => {
  test.each([
    "definition",
    "grants",
    "members",
    "overview",
  ])("accepts %s", (value) => {
    expect(isSection(value)).toBe(true);
  });

  test("rejects unknown values", () => {
    expect(isSection("settings")).toBe(false);
  });
});

describe("facetStateOf", () => {
  test("treats a disabled query as ready even while pending", () => {
    expect(facetStateOf(false, { error: undefined, isPending: true })).toBe(
      "ready"
    );
  });

  test("maps a query error to error", () => {
    expect(
      facetStateOf(true, { error: new Error("boom"), isPending: false })
    ).toBe("error");
  });

  test("maps a pending enabled query to loading", () => {
    expect(facetStateOf(true, { error: undefined, isPending: true })).toBe(
      "loading"
    );
  });

  test("marks intentionally deferred facets as idle", () => {
    expect(
      facetStateOf(
        true,
        { error: undefined, isPending: true },
        { deferred: true }
      )
    ).toBe("idle");
  });

  test("maps a settled enabled query to ready", () => {
    expect(facetStateOf(true, { error: undefined, isPending: false })).toBe(
      "ready"
    );
  });
});

describe("shouldLoadRoleFacets", () => {
  test("defers fetch-all role facets until grants or access map needs them", () => {
    expect(shouldLoadRoleFacets("overview")).toBe(false);
    expect(shouldLoadRoleFacets("definition")).toBe(false);
    expect(shouldLoadRoleFacets("members")).toBe(false);
    expect(shouldLoadRoleFacets("grants")).toBe(true);
    expect(shouldLoadRoleFacets("access-map")).toBe(true);
  });
});

describe("connLimitDisplay", () => {
  test("shows Unlimited for a negative limit", () => {
    expect(connLimitDisplay(-1)).toBe("Unlimited");
  });

  test("shows No connections for zero", () => {
    expect(connLimitDisplay(0)).toBe("No connections");
  });

  test("shows the numeric limit when positive", () => {
    expect(connLimitDisplay(25)).toBe("Limit 25");
  });
});

describe("builtinDetailText", () => {
  test("prefers the built-in descriptor summary", () => {
    expect(
      builtinDetailText(predefinedRoleInfo("pg_read_all_data"), ["pg_monitor"])
    ).toBe("Read every table, view, and sequence in all databases.");
  });

  test("lists built-in parents when the role itself is not built in", () => {
    expect(builtinDetailText(null, ["pg_monitor", "pg_read_all_data"])).toBe(
      "Member of pg_monitor, pg_read_all_data — inherits its implicit privileges."
    );
  });

  test("explains when neither applies", () => {
    expect(builtinDetailText(null, [])).toBe(
      "Not a built-in role and not a member of one."
    );
  });
});

describe("rlsNoteText", () => {
  test("flags full bypass for superusers", () => {
    expect(
      rlsNoteText({
        bypassesRls: false,
        isSuperuser: true,
        tableAccessActive: false,
      })
    ).toBe("Row-level security is bypassed entirely by this role.");
  });

  test("flags full bypass for BYPASSRLS roles", () => {
    expect(
      rlsNoteText({
        bypassesRls: true,
        isSuperuser: false,
        tableAccessActive: true,
      })
    ).toBe("Row-level security is bypassed entirely by this role.");
  });

  test("warns that RLS may still apply when the role has table access", () => {
    expect(
      rlsNoteText({
        bypassesRls: false,
        isSuperuser: false,
        tableAccessActive: true,
      })
    ).toBe(
      "Row-level security may still restrict which rows are visible — table access alone doesn't override RLS policies."
    );
  });

  test("returns no note without bypass or table access", () => {
    expect(
      rlsNoteText({
        bypassesRls: false,
        isSuperuser: false,
        tableAccessActive: false,
      })
    ).toBeNull();
  });
});

describe("capabilities", () => {
  test("defaults everything off for missing attributes except INHERIT", () => {
    const list = capabilities(undefined);

    expect(
      list.map((capability) => [capability.keyword, capability.on])
    ).toEqual([
      ["LOGIN", false],
      ["SUPERUSER", false],
      ["CREATEDB", false],
      ["CREATEROLE", false],
      ["REPLICATION", false],
      ["BYPASSRLS", false],
      ["INHERIT", true],
      ["CONNECTION LIMIT", false],
      ["VALID UNTIL", false],
    ]);
  });

  test("reflects boolean attribute flags", () => {
    const list = capabilities(
      attributes({
        bypassesRls: true,
        canCreateDatabase: true,
        canCreateRole: true,
        canLogin: true,
        canReplicate: true,
        inheritsByDefault: false,
        isSuperuser: true,
      })
    );

    expect(capabilityByKeyword(list, "LOGIN").on).toBe(true);
    expect(capabilityByKeyword(list, "SUPERUSER").on).toBe(true);
    expect(capabilityByKeyword(list, "CREATEDB").on).toBe(true);
    expect(capabilityByKeyword(list, "CREATEROLE").on).toBe(true);
    expect(capabilityByKeyword(list, "REPLICATION").on).toBe(true);
    expect(capabilityByKeyword(list, "BYPASSRLS").on).toBe(true);
    expect(capabilityByKeyword(list, "INHERIT").on).toBe(false);
  });

  test("renders an unlimited connection limit as a value, not a flag", () => {
    const limit = capabilityByKeyword(
      capabilities(attributes({ connectionLimit: -1 })),
      "CONNECTION LIMIT"
    );

    expect(limit).toMatchObject({
      description: "No limit on concurrent connections.",
      on: false,
      value: "Unlimited",
    });
  });

  test("describes a zero connection limit as no connections allowed", () => {
    const limit = capabilityByKeyword(
      capabilities(attributes({ connectionLimit: 0 })),
      "CONNECTION LIMIT"
    );

    expect(limit).toMatchObject({
      description: "No connections allowed.",
      on: true,
      value: "0",
    });
  });

  test("describes a positive connection limit with its count", () => {
    const limit = capabilityByKeyword(
      capabilities(attributes({ connectionLimit: 8 })),
      "CONNECTION LIMIT"
    );

    expect(limit).toMatchObject({
      description: "Up to 8 concurrent connections.",
      on: true,
      value: "8",
    });
  });

  test("marks VALID UNTIL as a dated danger when an expiry is set", () => {
    const validUntil = timestampFromDate(new Date(2027, 0, 15));
    const expiry = capabilityByKeyword(
      capabilities(attributes({ validUntil })),
      "VALID UNTIL"
    );

    expect(expiry).toMatchObject({
      danger: true,
      description: "Login is rejected after this date.",
      on: true,
      value: timestampDate(validUntil).toLocaleDateString(),
    });
  });

  test("marks VALID UNTIL as never expiring without an expiry", () => {
    const expiry = capabilityByKeyword(
      capabilities(attributes({})),
      "VALID UNTIL"
    );

    expect(expiry).toMatchObject({
      danger: false,
      description: "Password never expires.",
      on: false,
      value: "Never",
    });
  });
});

describe("directGrantsSubText", () => {
  test("says No databases when no database is selectable", () => {
    expect(
      directGrantsSubText({
        effectiveDbId: null,
        error: undefined,
        grantSchemaCount: 0,
        grantsReady: false,
      })
    ).toBe("No databases");
  });

  test("says Unavailable when the grants query failed", () => {
    expect(
      directGrantsSubText({
        effectiveDbId: "db1",
        error: new Error("boom"),
        grantSchemaCount: 0,
        grantsReady: false,
      })
    ).toBe("Unavailable");
  });

  test("counts schemas with pluralization when ready", () => {
    expect(
      directGrantsSubText({
        effectiveDbId: "db1",
        error: undefined,
        grantSchemaCount: 1,
        grantsReady: true,
      })
    ).toBe("objects across 1 schema");
    expect(
      directGrantsSubText({
        effectiveDbId: "db1",
        error: undefined,
        grantSchemaCount: 3,
        grantsReady: true,
      })
    ).toBe("objects across 3 schemas");
  });

  test("returns undefined while still loading", () => {
    expect(
      directGrantsSubText({
        effectiveDbId: "db1",
        error: undefined,
        grantSchemaCount: 0,
        grantsReady: false,
      })
    ).toBeUndefined();
  });

  test("explains when direct grants were deferred for performance", () => {
    expect(
      directGrantsSubText({
        deferred: true,
        effectiveDbId: "db1",
        error: undefined,
        grantSchemaCount: 0,
        grantsReady: false,
      })
    ).toBe("Open Grants to load direct grants");
  });
});

describe("ownedSubText", () => {
  test("says No databases when no database is selectable", () => {
    expect(
      ownedSubText({
        databaseName: undefined,
        effectiveDbId: null,
        error: undefined,
        ownedCount: 0,
        ownedReady: false,
      })
    ).toBe("No databases");
  });

  test("says Unavailable when the owned query failed", () => {
    expect(
      ownedSubText({
        databaseName: "appdb",
        effectiveDbId: "db1",
        error: new Error("boom"),
        ownedCount: 0,
        ownedReady: false,
      })
    ).toBe("Unavailable");
  });

  test("counts owned objects with pluralization and database name", () => {
    expect(
      ownedSubText({
        databaseName: "appdb",
        effectiveDbId: "db1",
        error: undefined,
        ownedCount: 1,
        ownedReady: true,
      })
    ).toBe("object in appdb");
    expect(
      ownedSubText({
        databaseName: "appdb",
        effectiveDbId: "db1",
        error: undefined,
        ownedCount: 4,
        ownedReady: true,
      })
    ).toBe("objects in appdb");
  });

  test("falls back to a generic database name", () => {
    expect(
      ownedSubText({
        databaseName: undefined,
        effectiveDbId: "db1",
        error: undefined,
        ownedCount: 2,
        ownedReady: true,
      })
    ).toBe("objects in db");
  });

  test("reports zero owned objects in plain words", () => {
    expect(
      ownedSubText({
        databaseName: "appdb",
        effectiveDbId: "db1",
        error: undefined,
        ownedCount: 0,
        ownedReady: true,
      })
    ).toBe("no owned objects");
  });

  test("returns undefined while still loading", () => {
    expect(
      ownedSubText({
        databaseName: "appdb",
        effectiveDbId: "db1",
        error: undefined,
        ownedCount: 0,
        ownedReady: false,
      })
    ).toBeUndefined();
  });

  test("explains when ownership was deferred for performance", () => {
    expect(
      ownedSubText({
        databaseName: "appdb",
        deferred: true,
        effectiveDbId: "db1",
        error: undefined,
        ownedCount: 0,
        ownedReady: false,
      })
    ).toBe("Open Grants to load ownership");
  });
});

describe("deriveBuiltinParents", () => {
  test("collects pg_* parents with descriptor summaries when known", () => {
    const role = create(RoleSchema, {
      memberOf: [
        {
          role: "instances/i1/roles/app_writers",
          roleName: "app_writers",
        },
        {
          role: "instances/i1/roles/pg_read_all_data",
          roleName: "pg_read_all_data",
        },
        {
          role: "instances/i1/roles/pg_future_role",
          roleName: "pg_future_role",
        },
      ],
      name: "instances/i1/roles/reporter",
      roleName: "reporter",
    });

    expect(deriveBuiltinParents(role)).toEqual({
      details: [
        {
          roleId: "pg_read_all_data",
          roleName: "pg_read_all_data",
          summary: "Read every table, view, and sequence in all databases.",
        },
        {
          roleId: "pg_future_role",
          roleName: "pg_future_role",
          summary: null,
        },
      ],
      names: ["pg_read_all_data", "pg_future_role"],
    });
  });

  test("returns empty results for a role with no built-in parents", () => {
    const role = create(RoleSchema, {
      memberOf: [
        { role: "instances/i1/roles/app_writers", roleName: "app_writers" },
      ],
      name: "instances/i1/roles/reporter",
      roleName: "reporter",
    });

    expect(deriveBuiltinParents(role)).toEqual({ details: [], names: [] });
  });
});

describe("buildAccessRows", () => {
  const parentRole: RelatedRole = {
    options: [],
    roleId: "app_writers",
    roleName: "app_writers",
  };

  const grantObject: GrantedObject = {
    grantors: [],
    key: "key",
    objectName: "orders",
    objectType: GrantObjectType.TABLE,
    privileges: [{ grantable: false, name: "SELECT" }],
    schemaName: "public",
  };

  const inactiveArgs = {
    belongsTo: [],
    builtinActive: false,
    builtinDetail: "Not a built-in role and not a member of one.",
    builtinInfo: null,
    builtinParents: [],
    effectiveDb: null,
    grantObjects: [],
    grantsReady: false,
    isSuperuser: false,
    ownedCount: 0,
    publicCount: 0,
  };

  test("renders every access path as inactive for a plain role", () => {
    const rows = buildAccessRows(inactiveArgs);

    expect(
      rows.map((row) => [row.label, row.active, row.status, row.jump?.section])
    ).toEqual([
      ["Superuser bypass", false, "—", undefined],
      ["Built-in role powers", false, "—", undefined],
      ["Inherited (membership)", false, "0", undefined],
      ["Owns objects", false, "0", undefined],
      ["Direct grants", false, "—", "grants"],
      ["PUBLIC (everyone)", false, "0", undefined],
    ]);
    expect(rows.map((row) => row.detail)).toEqual([
      "Not a superuser.",
      "Not a built-in role and not a member of one.",
      "Not a member of any other role.",
      "Owns no objects here.",
      "No database selected.",
      "Everyone — including this role — holds these.",
    ]);
  });

  test("activates each row when its access path applies", () => {
    const rows = buildAccessRows({
      belongsTo: [parentRole],
      builtinActive: true,
      builtinDetail: "Member of pg_monitor — inherits its implicit privileges.",
      builtinInfo: null,
      builtinParents: ["pg_monitor"],
      effectiveDb: { id: "db1", name: "appdb" },
      grantObjects: [grantObject],
      grantsReady: true,
      isSuperuser: true,
      ownedCount: 3,
      publicCount: 2,
    });

    expect(
      rows.map((row) => [row.label, row.active, row.status, row.jump?.section])
    ).toEqual([
      ["Superuser bypass", true, "Active", undefined],
      ["Built-in role powers", true, "Active", "members"],
      ["Inherited (membership)", true, "1", "members"],
      ["Owns objects", true, "3", "grants"],
      ["Direct grants", true, "1", "grants"],
      ["PUBLIC (everyone)", true, "2", "grants"],
    ]);
    expect(rows[0]?.detail).toBe(
      "Bypasses every permission check — full access to everything."
    );
    expect(rows[2]?.detail).toBe("Inherits the access of its parent roles.");
    expect(rows[3]?.detail).toBe(
      "Implicit full privileges on the objects it owns."
    );
    expect(rows[4]?.detail).toBe(
      "Explicit object privileges granted to this role."
    );
  });

  test("omits the membership jump when the role is built in by itself", () => {
    const rows = buildAccessRows({
      ...inactiveArgs,
      builtinActive: true,
      builtinDetail: "Read every table, view, and sequence in all databases.",
      builtinInfo: predefinedRoleInfo("pg_read_all_data"),
      builtinParents: ["pg_monitor"],
    });

    expect(rows[1]?.jump).toBeUndefined();
  });

  test("waits for the grants query before counting direct grants", () => {
    const rows = buildAccessRows({
      ...inactiveArgs,
      effectiveDb: { id: "db1", name: "appdb" },
      grantObjects: [grantObject],
      grantsReady: false,
    });

    expect(rows[4]).toMatchObject({ active: true, status: "—" });
  });

  test("marks deferred expensive facets as loadable instead of zero", () => {
    const rows = buildAccessRows({
      ...inactiveArgs,
      effectiveDb: { id: "db1", name: "appdb" },
      ownedState: "idle",
      publicGrantsState: "idle",
    });

    expect(rows[3]).toMatchObject({
      active: false,
      detail: "Open Grants to load owned objects.",
      jump: { label: "Grants", section: "grants" },
      status: "Load",
    });
    expect(rows[5]).toMatchObject({
      active: false,
      detail: "Open Grants to load PUBLIC grants.",
      jump: { label: "Grants", section: "grants" },
      status: "Load",
    });
  });

  test("marks deferred direct grants as loadable instead of empty", () => {
    const rows = buildAccessRows({
      ...inactiveArgs,
      effectiveDb: { id: "db1", name: "appdb" },
      grantsDeferred: true,
    });

    expect(rows[4]).toMatchObject({
      active: false,
      detail: "Open Grants to load direct grants.",
      jump: { label: "Grants", section: "grants" },
      status: "Load",
    });
  });
});
