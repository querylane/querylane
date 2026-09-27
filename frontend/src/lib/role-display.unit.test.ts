import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "@rstest/core";
import {
  buildInverseMembershipIndex,
  buildRoleSql,
  categorizeRoles,
  computeRoleRisk,
  deriveRoleKind,
  describeRoleRisk,
  formatConnectionLimit,
  passwordExpiryStatus,
  roleCapabilityMatrix,
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

describe("deriveRoleKind", () => {
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
});

describe("passwordExpiryStatus", () => {
  it("reports no expiry when unset", () => {
    expect(passwordExpiryStatus(undefined, NOW).state).toBe("none");
  });

  it("treats far-future expiry as valid", () => {
    const later = timestampFromDate(new Date("2026-12-01T00:00:00Z"));
    expect(passwordExpiryStatus(later, NOW).state).toBe("valid");
  });
});

describe("computeRoleRisk", () => {
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
});

describe("formatConnectionLimit", () => {
  it("formats unlimited, zero, and positive limits", () => {
    expect(formatConnectionLimit(-1)).toBe("Unlimited");
    expect(formatConnectionLimit(0)).toBe("No connections allowed (0)");
    expect(formatConnectionLimit(1)).toBe("1 concurrent connection");
    expect(formatConnectionLimit(5)).toBe("5 concurrent connections");
  });
});
