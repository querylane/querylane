import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import type { GrantsType } from "@/components/console-pages/role-detail-search";
import {
  aggregateGrants,
  buildSchemaIndex,
  columnsFor,
  dedupePrivileges,
  densityCounts,
  densityState,
  dominantGrantor,
  type GrantedObject,
  getObjectTypeLabel,
  grantorSummary,
  groupBySchema,
  groupDefaultPrivileges,
  objectDisplayName,
  objectMatchesFilters,
  ownedObjectName,
  ownedStats,
  privAbbr,
  privTone,
  privTooltip,
  SLUG_TO_OBJECT_TYPE,
  schemaBreakdownLabel,
  slugForObjectType,
} from "@/components/console-pages/role-grants-shared";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  type ObjectGrant,
  ObjectGrantSchema,
  type OwnedObject,
  OwnedObjectSchema,
  type RoleDefaultPrivilege,
  RoleDefaultPrivilegeSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

function grant(init: {
  grantor?: string;
  objectName?: string;
  objectType?: GrantObjectType;
  privilege?: string;
  schemaName?: string;
  withGrantOption?: boolean;
}): ObjectGrant {
  return create(ObjectGrantSchema, init);
}

function grantedObject(init: Partial<GrantedObject>): GrantedObject {
  return {
    grantors: [],
    key: "key",
    objectName: "orders",
    objectType: GrantObjectType.TABLE,
    privileges: [],
    schemaName: "public",
    ...init,
  };
}

describe("aggregateGrants", () => {
  test("merges rows for the same object into one entry with all privileges", () => {
    const result = aggregateGrants([
      grant({
        grantor: "owner_a",
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        privilege: "SELECT",
        schemaName: "public",
      }),
      grant({
        grantor: "owner_a",
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        privilege: "INSERT",
        schemaName: "public",
        withGrantOption: true,
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      grantors: ["owner_a"],
      objectName: "orders",
      objectType: GrantObjectType.TABLE,
      privileges: [
        { grantable: false, name: "SELECT" },
        { grantable: true, name: "INSERT" },
      ],
      schemaName: "public",
    });
  });

  test("keeps objects apart by (type, schema, object) triple", () => {
    const result = aggregateGrants([
      grant({
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        privilege: "SELECT",
        schemaName: "public",
      }),
      grant({
        objectName: "orders",
        objectType: GrantObjectType.VIEW,
        privilege: "SELECT",
        schemaName: "public",
      }),
      grant({
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        privilege: "SELECT",
        schemaName: "sales",
      }),
    ]);

    expect(result).toHaveLength(3);
  });

  test("collects distinct grantors and skips empty grantor strings", () => {
    const result = aggregateGrants([
      grant({ grantor: "owner_a", privilege: "SELECT" }),
      grant({ grantor: "owner_a", privilege: "INSERT" }),
      grant({ grantor: "owner_b", privilege: "UPDATE" }),
      grant({ grantor: "", privilege: "DELETE" }),
    ]);

    expect(result[0]?.grantors).toEqual(["owner_a", "owner_b"]);
  });

  test("returns an empty list for no grants", () => {
    expect(aggregateGrants([])).toEqual([]);
  });
});

describe("getObjectTypeLabel", () => {
  test("returns the metadata label for a known object type", () => {
    expect(getObjectTypeLabel(GrantObjectType.MATERIALIZED_VIEW)).toBe(
      "Materialized view"
    );
    expect(getObjectTypeLabel(GrantObjectType.LARGE_OBJECT)).toBe(
      "Large object"
    );
  });

  test("falls back to the generic label for an unknown enum value", () => {
    // Proto3 enums are open: the wire can carry values this client predates.
    expect(getObjectTypeLabel(99 as GrantObjectType)).toBe("Object");
  });
});

describe("slugForObjectType", () => {
  test("round-trips every slug in SLUG_TO_OBJECT_TYPE", () => {
    for (const slug of Object.keys(SLUG_TO_OBJECT_TYPE) as GrantsType[]) {
      expect(slugForObjectType(SLUG_TO_OBJECT_TYPE[slug])).toBe(slug);
    }
  });

  test("returns undefined for a type with no slug", () => {
    expect(slugForObjectType(GrantObjectType.UNSPECIFIED)).toBeUndefined();
  });
});

describe("privAbbr", () => {
  test("uses the curated abbreviation when one exists", () => {
    expect(privAbbr("TRUNCATE")).toBe("TRN");
  });

  test("uses the PostgreSQL 17 MAINTAIN abbreviation", () => {
    expect(privAbbr("MAINTAIN")).toBe("MNT");
  });

  test("falls back to the first three characters for unknown privileges", () => {
    expect(privAbbr("MERGE")).toBe("MER");
  });
});

describe("privTooltip", () => {
  test("combines name and gloss for a known privilege", () => {
    expect(privTooltip("SELECT")).toBe("SELECT — read rows");
  });

  test("describes PostgreSQL 17 MAINTAIN privileges", () => {
    expect(privTooltip("MAINTAIN")).toBe("MAINTAIN — VACUUM, ANALYZE, REINDEX");
  });

  test("returns the bare name when no gloss is known", () => {
    expect(privTooltip("MERGE")).toBe("MERGE");
  });
});

describe("privTone", () => {
  test.each([
    "SELECT",
    "USAGE",
    "CONNECT",
    "EXECUTE",
  ])("classifies %s as read", (name) => {
    expect(privTone(name)).toBe("read");
  });

  test.each([
    "INSERT",
    "UPDATE",
    "REFERENCES",
    "TRIGGER",
    "TEMPORARY",
    "MAINTAIN",
  ])("classifies %s as write", (name) => {
    expect(privTone(name)).toBe("write");
  });

  test.each(["DELETE", "TRUNCATE"])("classifies %s as destructive", (name) => {
    expect(privTone(name)).toBe("destructive");
  });

  test("classifies CREATE as create", () => {
    expect(privTone("CREATE")).toBe("create");
  });

  test("classifies unknown privileges as default", () => {
    expect(privTone("MERGE")).toBe("default");
  });
});

describe("objectDisplayName", () => {
  test("uses the schema name for SCHEMA objects", () => {
    expect(
      objectDisplayName(
        grantedObject({
          objectName: "",
          objectType: GrantObjectType.SCHEMA,
          schemaName: "sales",
        })
      )
    ).toBe("sales");
  });

  test("uses the bare object name for DATABASE objects", () => {
    expect(
      objectDisplayName(
        grantedObject({
          objectName: "appdb",
          objectType: GrantObjectType.DATABASE,
          schemaName: "",
        })
      )
    ).toBe("appdb");
  });

  test("uses the bare object name when the schema is empty", () => {
    expect(
      objectDisplayName(
        grantedObject({
          objectName: "orders",
          objectType: GrantObjectType.TABLE,
          schemaName: "",
        })
      )
    ).toBe("orders");
  });

  test("qualifies relation names with their schema", () => {
    expect(
      objectDisplayName(
        grantedObject({ objectName: "orders", schemaName: "public" })
      )
    ).toBe("public.orders");
  });
});

describe("dedupePrivileges", () => {
  test("collapses repeated privileges keeping any grant option", () => {
    expect(
      dedupePrivileges([
        { grantable: false, name: "SELECT" },
        { grantable: true, name: "SELECT" },
        { grantable: true, name: "INSERT" },
        { grantable: false, name: "INSERT" },
        { grantable: false, name: "UPDATE" },
      ])
    ).toEqual([
      { grantable: true, name: "SELECT" },
      { grantable: true, name: "INSERT" },
      { grantable: false, name: "UPDATE" },
    ]);
  });
});

describe("grantorSummary", () => {
  test("returns null when there are no grantors", () => {
    expect(grantorSummary([])).toBeNull();
  });

  test("returns the single grantor without a title", () => {
    expect(grantorSummary(["owner_a"])).toEqual({
      text: "owner_a",
      title: undefined,
    });
  });

  test("condenses multiple grantors to a count with a full-list title", () => {
    expect(grantorSummary(["owner_a", "owner_b", "owner_c"])).toEqual({
      text: "3 roles",
      title: "owner_a, owner_b, owner_c",
    });
  });

  test("renders a missing single entry as empty text", () => {
    // Sparse array: length 1 with a hole — exercises the defensive fallback.
    expect(grantorSummary(new Array<string>(1))).toEqual({
      text: "",
      title: undefined,
    });
  });
});

describe("dominantGrantor", () => {
  test("returns null when no object has a grantor", () => {
    expect(dominantGrantor([grantedObject({ grantors: [] })])).toBeNull();
  });

  test("returns the lone grantor without a suffix", () => {
    expect(
      dominantGrantor([
        grantedObject({ grantors: ["owner_a"] }),
        grantedObject({ grantors: ["owner_a"] }),
      ])
    ).toBe("owner_a");
  });

  test("suffixes the most frequent grantor with the number of others", () => {
    expect(
      dominantGrantor([
        grantedObject({ grantors: ["owner_b"] }),
        grantedObject({ grantors: ["owner_a", "owner_b"] }),
        grantedObject({ grantors: ["owner_c"] }),
      ])
    ).toBe("owner_b +2");
  });
});

describe("columnsFor", () => {
  test("returns the canonical vocabulary for a known type", () => {
    expect(columnsFor(GrantObjectType.SEQUENCE, [])).toEqual([
      "USAGE",
      "SELECT",
      "UPDATE",
    ]);
  });

  test("appends privileges present in the data but not in the vocabulary", () => {
    expect(
      columnsFor(GrantObjectType.TABLE, [
        grantedObject({
          privileges: [
            { grantable: false, name: "SELECT" },
            { grantable: false, name: "MAINTAIN" },
            { grantable: false, name: "MAINTAIN" },
          ],
        }),
      ])
    ).toEqual([
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
      "MAINTAIN",
    ]);
  });

  test("builds columns purely from data for a type with no vocabulary", () => {
    expect(
      columnsFor(GrantObjectType.UNSPECIFIED, [
        grantedObject({ privileges: [{ grantable: false, name: "SELECT" }] }),
      ])
    ).toEqual(["SELECT"]);
  });
});

describe("densityCounts", () => {
  test("counts each object at most once per privilege column", () => {
    expect(
      densityCounts(
        [
          grantedObject({
            privileges: [
              { grantable: false, name: "SELECT" },
              { grantable: true, name: "SELECT" },
              { grantable: false, name: "INSERT" },
            ],
          }),
          grantedObject({
            privileges: [{ grantable: false, name: "SELECT" }],
          }),
        ],
        ["SELECT", "INSERT", "DELETE"]
      )
    ).toEqual({ DELETE: 0, INSERT: 1, SELECT: 2 });
  });

  test("ignores privileges that are not in the column set", () => {
    expect(
      densityCounts(
        [grantedObject({ privileges: [{ grantable: false, name: "USAGE" }] })],
        ["SELECT"]
      )
    ).toEqual({ SELECT: 0 });
  });
});

describe("densityState", () => {
  test("maps zero to none", () => {
    expect(densityState(0, 5)).toBe("none");
  });

  test("maps a full count to full", () => {
    expect(densityState(5, 5)).toBe("full");
  });

  test("maps a partial count to partial", () => {
    expect(densityState(3, 5)).toBe("partial");
  });
});

describe("groupBySchema", () => {
  test("groups objects by schema preserving insertion order", () => {
    const publicOrders = grantedObject({ schemaName: "public" });
    const publicUsers = grantedObject({
      objectName: "users",
      schemaName: "public",
    });
    const salesLeads = grantedObject({
      objectName: "leads",
      schemaName: "sales",
    });

    expect(groupBySchema([publicOrders, salesLeads, publicUsers])).toEqual([
      ["public", [publicOrders, publicUsers]],
      ["sales", [salesLeads]],
    ]);
  });
});

describe("objectMatchesFilters", () => {
  const object = grantedObject({
    objectName: "orders",
    privileges: [
      { grantable: true, name: "SELECT" },
      { grantable: false, name: "INSERT" },
    ],
    schemaName: "public",
  });

  test("matches when no filter is active", () => {
    expect(objectMatchesFilters(object, "", false, [])).toBe(true);
  });

  test("rejects when the needle is not in the display name", () => {
    expect(objectMatchesFilters(object, "invoices", false, [])).toBe(false);
  });

  test("matches the needle against the schema-qualified name", () => {
    expect(objectMatchesFilters(object, "public.ord", false, [])).toBe(true);
  });

  test("rejects grant-only filter when nothing is grantable", () => {
    expect(
      objectMatchesFilters(
        grantedObject({ privileges: [{ grantable: false, name: "SELECT" }] }),
        "",
        true,
        []
      )
    ).toBe(false);
  });

  test("passes grant-only filter when any privilege is grantable", () => {
    expect(objectMatchesFilters(object, "", true, [])).toBe(true);
  });

  test("requires every active privilege to be held", () => {
    expect(objectMatchesFilters(object, "", false, ["SELECT", "DELETE"])).toBe(
      false
    );
    expect(objectMatchesFilters(object, "", false, ["SELECT", "INSERT"])).toBe(
      true
    );
  });
});

describe("buildSchemaIndex", () => {
  test("rolls schema objects into per-schema groups with byType buckets", () => {
    const orders = grantedObject({ schemaName: "public" });
    const users = grantedObject({ objectName: "users", schemaName: "public" });
    const ordersView = grantedObject({
      objectName: "orders_view",
      objectType: GrantObjectType.VIEW,
      schemaName: "public",
    });

    const groups = buildSchemaIndex([orders, users, ordersView]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      database: false,
      objects: [orders, users, ordersView],
      schema: "public",
      total: 3,
    });
    expect(groups[0]?.byType.get(GrantObjectType.TABLE)).toEqual([
      orders,
      users,
    ]);
    expect(groups[0]?.byType.get(GrantObjectType.VIEW)).toEqual([ordersView]);
  });

  test("collapses DATABASE grants into one synthetic row sorted first", () => {
    const table = grantedObject({ schemaName: "public" });
    const database = grantedObject({
      objectName: "appdb",
      objectType: GrantObjectType.DATABASE,
      schemaName: "",
    });

    const groups = buildSchemaIndex([table, database]);

    expect(groups.map((group) => group.schema)).toEqual(["database", "public"]);
    expect(groups[0]).toMatchObject({ database: true, total: 1 });
  });

  test("groups large objects under database scope", () => {
    const largeObject = grantedObject({
      objectName: "910277",
      objectType: GrantObjectType.LARGE_OBJECT,
      schemaName: "",
    });

    const groups = buildSchemaIndex([largeObject]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      database: true,
      objects: [largeObject],
      schema: "database",
      total: 1,
    });
    expect(groups[0]?.byType.get(GrantObjectType.LARGE_OBJECT)).toEqual([
      largeObject,
    ]);
  });

  test("keeps schemas in encounter order after the database row", () => {
    const groups = buildSchemaIndex([
      grantedObject({ schemaName: "sales" }),
      grantedObject({
        objectName: "appdb",
        objectType: GrantObjectType.DATABASE,
        schemaName: "",
      }),
      grantedObject({ schemaName: "public" }),
      grantedObject({
        objectName: "appdb",
        objectType: GrantObjectType.DATABASE,
        schemaName: "",
      }),
    ]);

    expect(groups.map((group) => group.schema)).toEqual([
      "database",
      "sales",
      "public",
    ]);
    expect(groups[0]?.total).toBe(2);
  });
});

describe("schemaBreakdownLabel", () => {
  test("labels the synthetic database group", () => {
    const groups = buildSchemaIndex([
      grantedObject({
        objectName: "appdb",
        objectType: GrantObjectType.DATABASE,
        schemaName: "",
      }),
    ]);

    expect(schemaBreakdownLabel(groups[0]!)).toBe("database-level grant");
  });

  test("includes large object counts in the database group", () => {
    const groups = buildSchemaIndex([
      grantedObject({
        objectName: "910277",
        objectType: GrantObjectType.LARGE_OBJECT,
        schemaName: "",
      }),
      grantedObject({
        objectName: "910278",
        objectType: GrantObjectType.LARGE_OBJECT,
        schemaName: "",
      }),
    ]);

    expect(schemaBreakdownLabel(groups[0]!)).toBe("2 large objects");
  });

  test("lists per-type counts with pluralization in breakdown order", () => {
    const groups = buildSchemaIndex([
      grantedObject({
        objectName: "seq",
        objectType: GrantObjectType.SEQUENCE,
      }),
      grantedObject({ objectName: "orders" }),
      grantedObject({ objectName: "users" }),
      grantedObject({
        objectName: "orders_view",
        objectType: GrantObjectType.VIEW,
      }),
    ]);

    expect(schemaBreakdownLabel(groups[0]!)).toBe(
      "2 tables · 1 view · 1 sequence"
    );
  });

  test("appends the schema-level grant marker when a SCHEMA grant exists", () => {
    const groups = buildSchemaIndex([
      grantedObject({ objectName: "orders" }),
      grantedObject({
        objectName: "",
        objectType: GrantObjectType.SCHEMA,
        schemaName: "public",
      }),
    ]);

    expect(schemaBreakdownLabel(groups[0]!)).toBe(
      "1 table · schema-level grant"
    );
  });
});

function owned(init: {
  objectName?: string;
  objectType?: GrantObjectType;
  schemaName?: string;
}): OwnedObject {
  return create(OwnedObjectSchema, init);
}

describe("ownedObjectName", () => {
  test("uses the schema name for SCHEMA objects", () => {
    expect(
      ownedObjectName(
        owned({ objectType: GrantObjectType.SCHEMA, schemaName: "sales" })
      )
    ).toBe("sales");
  });

  test("falls back to the object name for DATABASE objects with no schema", () => {
    expect(
      ownedObjectName(
        owned({
          objectName: "appdb",
          objectType: GrantObjectType.DATABASE,
          schemaName: "",
        })
      )
    ).toBe("appdb");
  });

  test("uses the bare object name for relations", () => {
    expect(
      ownedObjectName(
        owned({
          objectName: "orders",
          objectType: GrantObjectType.TABLE,
          schemaName: "public",
        })
      )
    ).toBe("orders");
  });
});

describe("ownedStats", () => {
  test("returns one stat per owned type in OWNED_TYPE_ORDER", () => {
    const stats = ownedStats([
      owned({
        objectName: "orders",
        objectType: GrantObjectType.TABLE,
        schemaName: "public",
      }),
      owned({ objectType: GrantObjectType.SCHEMA, schemaName: "sales" }),
      owned({
        objectName: "users",
        objectType: GrantObjectType.TABLE,
        schemaName: "public",
      }),
    ]);

    expect(stats).toEqual([
      {
        count: 1,
        examples: "sales",
        label: "schema",
        type: GrantObjectType.SCHEMA,
      },
      {
        count: 2,
        examples: "orders, users",
        label: "tables",
        type: GrantObjectType.TABLE,
      },
    ]);
  });

  test("truncates examples past the limit with a +N suffix", () => {
    const stats = ownedStats(
      ["a", "b", "c", "d", "e", "f"].map((name) =>
        owned({
          objectName: name,
          objectType: GrantObjectType.FUNCTION,
          schemaName: "public",
        })
      )
    );

    expect(stats[0]).toEqual({
      count: 6,
      examples: "a, b, c, d +2",
      label: "functions",
      type: GrantObjectType.FUNCTION,
    });
  });

  test("returns no stats for no owned objects", () => {
    expect(ownedStats([])).toEqual([]);
  });
});

function defaultPrivilege(init: {
  creatorRoleName?: string;
  objectType?: DefaultPrivilegeObjectType;
  privilege?: string;
  schemaName?: string;
  withGrantOption?: boolean;
}): RoleDefaultPrivilege {
  return create(RoleDefaultPrivilegeSchema, init);
}

describe("groupDefaultPrivileges", () => {
  test("groups rows into one rule per creator, type, and schema", () => {
    const rules = groupDefaultPrivileges([
      defaultPrivilege({
        creatorRoleName: "owner_a",
        objectType: DefaultPrivilegeObjectType.TABLES,
        privilege: "SELECT",
        schemaName: "public",
      }),
      defaultPrivilege({
        creatorRoleName: "owner_a",
        objectType: DefaultPrivilegeObjectType.TABLES,
        privilege: "INSERT",
        schemaName: "public",
        withGrantOption: true,
      }),
      defaultPrivilege({
        creatorRoleName: "owner_b",
        objectType: DefaultPrivilegeObjectType.TABLES,
        privilege: "SELECT",
        schemaName: "public",
      }),
      defaultPrivilege({
        creatorRoleName: "owner_a",
        objectType: DefaultPrivilegeObjectType.SEQUENCES,
        privilege: "USAGE",
        schemaName: "",
      }),
    ]);

    expect(rules).toHaveLength(3);
    expect(rules[0]).toMatchObject({
      creatorRoleName: "owner_a",
      objectType: DefaultPrivilegeObjectType.TABLES,
      privileges: [
        { grantable: false, name: "SELECT" },
        { grantable: true, name: "INSERT" },
      ],
      schemaName: "public",
    });
    expect(rules[1]).toMatchObject({ creatorRoleName: "owner_b" });
    expect(rules[2]).toMatchObject({
      objectType: DefaultPrivilegeObjectType.SEQUENCES,
      schemaName: "",
    });
  });

  test("returns no rules for no rows", () => {
    expect(groupDefaultPrivileges([])).toEqual([]);
  });
});
