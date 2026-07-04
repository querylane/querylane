import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  buildInverseMembershipIndex,
  buildRoleSql,
  categorizeRoles,
  computeRoleRisk,
  deriveRoleKind,
  describeRoleRisk,
  formatConnectionLimit,
  isPredefinedRoleName,
  passwordExpiryStatus,
  predefinedRoleInfo,
  roleCapabilityMatrix,
  roleIdOf,
  roleRiskNotice,
} from "@/lib/role-display";
import {
  RoleAttributesSchema,
  RoleMembershipSchema,
  RoleSchema,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const NOW = new Date("2026-05-22T00:00:00Z");

function makeRole({
  attributes = {},
  isSystemRole = false,
  memberOf = [],
  roleName,
}: {
  attributes?: Partial<{
    canLogin: boolean;
    isSuperuser: boolean;
    canCreateDatabase: boolean;
    canCreateRole: boolean;
    canReplicate: boolean;
    bypassesRls: boolean;
    inheritsByDefault: boolean;
    connectionLimit: number;
    validUntil: ReturnType<typeof timestampFromDate>;
  }>;
  isSystemRole?: boolean;
  memberOf?: { roleName: string; adminOption?: boolean }[];
  roleName: string;
}) {
  return create(RoleSchema, {
    attributes: create(RoleAttributesSchema, attributes),
    isSystemRole,
    memberOf: memberOf.map((m) =>
      create(RoleMembershipSchema, {
        adminOption: m.adminOption ?? false,
        role: `instances/db/roles/${m.roleName}`,
        roleName: m.roleName,
      })
    ),
    name: `instances/db/roles/${roleName}`,
    roleName,
  });
}

describe("roleIdOf", () => {
  it("returns the resource-name leaf", () => {
    expect(roleIdOf(makeRole({ roleName: "app_user" }))).toBe("app_user");
  });
});

describe("deriveRoleKind", () => {
  it("classifies superusers first, regardless of login or replication", () => {
    expect(
      deriveRoleKind(
        makeRole({
          attributes: { canLogin: true, canReplicate: true, isSuperuser: true },
          roleName: "admin",
        })
      )
    ).toBe("super");
  });

  it("classifies a replicating login role as repl", () => {
    expect(
      deriveRoleKind(
        makeRole({
          attributes: { canLogin: true, canReplicate: true },
          roleName: "replicator",
        })
      )
    ).toBe("repl");
  });

  it("classifies a non-login role as group", () => {
    expect(
      deriveRoleKind(
        makeRole({ attributes: { canLogin: false }, roleName: "anon" })
      )
    ).toBe("group");
  });

  it("classifies a plain login role as login", () => {
    expect(
      deriveRoleKind(
        makeRole({ attributes: { canLogin: true }, roleName: "app_user" })
      )
    ).toBe("login");
  });

  it("classifies pg_* roles as builtin, even superuser-ish ones", () => {
    expect(
      deriveRoleKind(
        makeRole({
          attributes: { canLogin: false },
          roleName: "pg_read_all_data",
        })
      )
    ).toBe("builtin");
    expect(
      deriveRoleKind(
        makeRole({
          attributes: { canLogin: true },
          isSystemRole: true,
          roleName: "pg_monitor",
        })
      )
    ).toBe("builtin");
  });
});

const PG_VERSION_PREFIX = /^PG /;

describe("predefinedRoleInfo", () => {
  it("returns a descriptor for a known predefined role", () => {
    const info = predefinedRoleInfo("pg_read_all_data");
    expect(info).not.toBeNull();
    expect(info?.implicit.length).toBeGreaterThan(0);
    expect(info?.since).toMatch(PG_VERSION_PREFIX);
  });

  it("returns null for unknown or non-predefined names", () => {
    expect(predefinedRoleInfo("pg_made_up_role")).toBeNull();
    expect(predefinedRoleInfo("app_user")).toBeNull();
  });

  it("recognizes any pg_ prefixed name as predefined", () => {
    expect(isPredefinedRoleName("pg_made_up_role")).toBe(true);
    expect(isPredefinedRoleName("app_user")).toBe(false);
  });
});

describe("categorizeRoles", () => {
  it("treats system roles as system even when they can log in", () => {
    const result = categorizeRoles([
      makeRole({
        attributes: { canLogin: true },
        isSystemRole: true,
        roleName: "pg_monitor",
      }),
    ]);
    expect(result.system).toHaveLength(1);
    expect(result.login).toHaveLength(0);
  });

  it("splits login users from group roles", () => {
    const result = categorizeRoles([
      makeRole({ attributes: { canLogin: true }, roleName: "app_user" }),
      makeRole({ attributes: { canLogin: false }, roleName: "analysts" }),
    ]);
    expect(result.login.map((r) => r.roleName)).toEqual(["app_user"]);
    expect(result.group.map((r) => r.roleName)).toEqual(["analysts"]);
  });

  it("treats a role without attributes as a group role", () => {
    const role = create(RoleSchema, {
      name: "instances/db/roles/x",
      roleName: "x",
    });
    const result = categorizeRoles([role]);
    expect(result.group).toHaveLength(1);
  });
});

describe("buildInverseMembershipIndex", () => {
  it("indexes each child under every parent it belongs to", () => {
    const roles = [
      makeRole({
        memberOf: [{ adminOption: true, roleName: "analysts" }],
        roleName: "alice",
      }),
      makeRole({ memberOf: [{ roleName: "analysts" }], roleName: "bob" }),
      makeRole({ roleName: "analysts" }),
    ];
    const index = buildInverseMembershipIndex(roles);
    const members = index.get("analysts") ?? [];
    expect(members.map((m) => m.roleName)).toEqual(["alice", "bob"]);
    expect(members[0]?.adminOption).toBe(true);
    expect(members[0]?.roleId).toBe("alice");
  });

  it("omits roles that have no members", () => {
    const index = buildInverseMembershipIndex([
      makeRole({ roleName: "lonely" }),
    ]);
    expect(index.get("lonely")).toBeUndefined();
  });
});

describe("passwordExpiryStatus", () => {
  it("reports no expiry when unset", () => {
    expect(passwordExpiryStatus(undefined, NOW).state).toBe("none");
  });

  it("flags expired passwords", () => {
    const past = timestampFromDate(new Date("2026-05-01T00:00:00Z"));
    expect(passwordExpiryStatus(past, NOW).state).toBe("expired");
  });

  it("flags passwords expiring within 14 days as soon", () => {
    const soon = timestampFromDate(new Date("2026-05-30T00:00:00Z"));
    expect(passwordExpiryStatus(soon, NOW).state).toBe("soon");
  });

  it("treats far-future expiry as valid", () => {
    const later = timestampFromDate(new Date("2026-12-01T00:00:00Z"));
    expect(passwordExpiryStatus(later, NOW).state).toBe("valid");
  });
});

describe("computeRoleRisk", () => {
  it("counts attributes and is destructive with multiple superusers", () => {
    const risk = computeRoleRisk(
      [
        makeRole({ attributes: { isSuperuser: true }, roleName: "postgres" }),
        makeRole({
          attributes: { canCreateRole: true, isSuperuser: true },
          roleName: "admin",
        }),
      ],
      NOW
    );
    expect(risk.superusers).toBe(2);
    expect(risk.canCreateRole).toBe(1);
    expect(risk.severity).toBe("destructive");
  });

  it("is destructive when any role bypasses RLS", () => {
    const risk = computeRoleRisk(
      [makeRole({ attributes: { bypassesRls: true }, roleName: "rls" })],
      NOW
    );
    expect(risk.severity).toBe("destructive");
  });

  it("counts expired and expiring login passwords", () => {
    const risk = computeRoleRisk(
      [
        makeRole({
          attributes: {
            canLogin: true,
            validUntil: timestampFromDate(new Date("2026-05-01T00:00:00Z")),
          },
          roleName: "expired",
        }),
        makeRole({
          attributes: {
            canLogin: true,
            validUntil: timestampFromDate(new Date("2026-05-30T00:00:00Z")),
          },
          roleName: "soon",
        }),
      ],
      NOW
    );
    expect(risk.expiredPasswords).toBe(1);
    expect(risk.expiringSoon).toBe(1);
    expect(risk.severity).toBe("destructive");
  });

  it("stays default for a single benign superuser", () => {
    const risk = computeRoleRisk(
      [makeRole({ attributes: { isSuperuser: true }, roleName: "postgres" })],
      NOW
    );
    expect(risk.severity).toBe("default");
  });
});

describe("describeRoleRisk", () => {
  it("produces plural-aware clauses and hides zero counts", () => {
    const clauses = describeRoleRisk({
      bypassesRls: 0,
      canCreateDatabase: 0,
      canCreateRole: 2,
      expiredPasswords: 0,
      expiringSoon: 0,
      severity: "default",
      superusers: 1,
    });
    expect(clauses).toEqual(["1 superuser", "2 roles that can create roles"]);
  });
});

describe("roleCapabilityMatrix", () => {
  it("always returns all five server powers with granted flags", () => {
    const matrix = roleCapabilityMatrix(
      makeRole({
        attributes: { canCreateDatabase: true, isSuperuser: true },
        roleName: "admin",
      })
    );
    expect(matrix.map((c) => c.key)).toEqual([
      "superuser",
      "bypass-rls",
      "create-db",
      "create-role",
      "replication",
    ]);
    const granted = matrix.filter((c) => c.granted).map((c) => c.key);
    expect(granted).toEqual(["superuser", "create-db"]);
  });

  it("marks every power not granted for a plain role", () => {
    const matrix = roleCapabilityMatrix(makeRole({ roleName: "plain" }));
    expect(matrix.every((c) => !c.granted)).toBe(true);
    expect(matrix).toHaveLength(5);
  });
});

describe("roleRiskNotice", () => {
  it("flags superusers", () => {
    const notice = roleRiskNotice(
      makeRole({ attributes: { isSuperuser: true }, roleName: "postgres" })
    );
    expect(notice?.title).toBe("Full administrative access");
  });

  it("flags RLS-bypassing roles", () => {
    const notice = roleRiskNotice(
      makeRole({ attributes: { bypassesRls: true }, roleName: "rls" })
    );
    expect(notice?.title).toBe("Bypasses row-level security");
  });

  it("returns null for an ordinary role", () => {
    expect(roleRiskNotice(makeRole({ roleName: "app" }))).toBeNull();
  });
});

describe("buildRoleSql", () => {
  it("reconstructs CREATE ROLE with attribute keywords", () => {
    const sql = buildRoleSql(
      makeRole({
        attributes: {
          bypassesRls: true,
          canCreateDatabase: true,
          canLogin: true,
          connectionLimit: 5,
          inheritsByDefault: true,
          isSuperuser: true,
        },
        roleName: "app_user",
      })
    );
    expect(sql).toBe(
      'CREATE ROLE "app_user" WITH LOGIN SUPERUSER CREATEDB BYPASSRLS INHERIT CONNECTION LIMIT 5;'
    );
  });

  it("emits NOLOGIN and NOINHERIT and GRANT statements", () => {
    const sql = buildRoleSql(
      makeRole({
        attributes: {
          canLogin: false,
          connectionLimit: -1,
          inheritsByDefault: false,
        },
        memberOf: [{ adminOption: true, roleName: "analysts" }],
        roleName: "bot",
      })
    );
    expect(sql).toContain('CREATE ROLE "bot" WITH NOLOGIN NOINHERIT;');
    expect(sql).toContain(
      'GRANT "analysts" TO "bot" WITH ADMIN OPTION, INHERIT FALSE, SET FALSE;'
    );
  });

  it("quotes identifiers containing double quotes", () => {
    const sql = buildRoleSql(makeRole({ roleName: 'odd"name' }));
    expect(sql).toContain('CREATE ROLE "odd""name" WITH');
  });
});

describe("formatConnectionLimit", () => {
  it("formats unlimited, zero, and positive limits", () => {
    expect(formatConnectionLimit(-1)).toBe("Unlimited");
    expect(formatConnectionLimit(0)).toBe("No connections allowed (0)");
    expect(formatConnectionLimit(1)).toBe("1 concurrent connection");
    expect(formatConnectionLimit(5)).toBe("5 concurrent connections");
  });
});
