import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import {
  DatabaseSchema,
  type DatabaseService,
  GetDatabaseResponseSchema,
  ListDatabasesResponseSchema,
} from "../../protogen/querylane/console/v1alpha1/database_pb";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
  ListPublicGrantsResponseSchema,
  ListRoleDefaultPrivilegesResponseSchema,
  ListRoleGrantsResponseSchema,
  ListRoleOwnedObjectsResponseSchema,
  ListRolesResponseSchema,
  type ObjectGrantSchema,
  type OwnedObjectSchema,
  type RoleDefaultPrivilegeSchema,
  RoleSchema,
  type RoleService,
} from "../../protogen/querylane/console/v1alpha1/role_pb";

// One source of role data for rstest (served through createTestRouterTransport)
// and Playwright (served as Connect JSON through page.route). The access map
// mirrors the design source (`AMAP_ROLES`, `AMAP_OBJS`, `AMAP_EDGES`).
// Relative imports keep this module loadable from Playwright specs.

const ROLE_FIXTURE_INSTANCE_ID = "production";
const INSTANCE = `instances/${ROLE_FIXTURE_INSTANCE_ID}`;

type GrantInit = MessageInitShape<typeof ObjectGrantSchema>;
type OwnedObjectInit = MessageInitShape<typeof OwnedObjectSchema>;
type DefaultPrivilegeInit = MessageInitShape<typeof RoleDefaultPrivilegeSchema>;
type RoleInit = MessageInitShape<typeof RoleSchema>;

type RoleAccessRpc =
  | "listPublicGrants"
  | "listRoleDefaultPrivileges"
  | "listRoleGrants"
  | "listRoleOwnedObjects";

interface RoleDatabaseAccess {
  defaultPrivileges?: DefaultPrivilegeInit[];
  grants?: GrantInit[];
  ownedObjects?: OwnedObjectInit[];
}

interface RoleFixture {
  /** Keyed by `${roleId}@${databaseId}`. */
  access: Record<string, RoleDatabaseAccess>;
  databases: string[];
  /** `${rpc}:${roleId}@${databaseId}` pairs that fail with UNAVAILABLE. */
  failing?: readonly string[];
  /** RPCs that never answer, to hold the UI in its loading state. */
  pending?: readonly RoleAccessRpc[];
  /** Keyed by database id. */
  publicGrants: Record<string, GrantInit[]>;
  roles: RoleInit[];
  /** RPCs that report another page, so their results render as partial. */
  truncated?: readonly RoleAccessRpc[];
}

function membership(roleName: string) {
  return {
    grantor: "postgres",
    grantorRole: `${INSTANCE}/roles/postgres`,
    inheritOption: true,
    role: `${INSTANCE}/roles/${roleName}`,
    roleName,
    setOption: true,
  };
}

function role({
  attributes = {},
  comment = "Primary application login role.",
  isSystemRole = false,
  memberOf = [],
  roleName,
}: {
  attributes?: NonNullable<RoleInit["attributes"]>;
  comment?: string;
  isSystemRole?: boolean;
  memberOf?: string[];
  roleName: string;
}): RoleInit {
  return {
    attributes: {
      canLogin: true,
      connectionLimit: -1,
      inheritsByDefault: true,
      ...attributes,
    },
    comment,
    isSystemRole,
    memberOf: memberOf.map(membership),
    name: `${INSTANCE}/roles/${roleName}`,
    roleName,
  };
}

function schemaGrant(schemaName: string, privilege: string): GrantInit {
  return { objectType: GrantObjectType.SCHEMA, privilege, schemaName };
}

function ownedDatabase(id: string): OwnedObjectInit {
  return { objectName: id, objectType: GrantObjectType.DATABASE };
}

const ROLES_TABLE_ROLES = [
  role({
    attributes: { canCreateDatabase: true, isSuperuser: true },
    memberOf: ["pg_read_all_data"],
    roleName: "postgres",
  }),
  role({ memberOf: ["app_writer"], roleName: "app_user" }),
];

const ACCESS_MAP_ROLES = [
  role({ attributes: { isSuperuser: true }, roleName: "cloud_admin" }),
  role({ roleName: "app_owner" }),
  role({ memberOf: ["app_owner"], roleName: "app_readwrite" }),
  role({ roleName: "app_readonly" }),
  role({ memberOf: ["app_readonly"], roleName: "analytics_reader" }),
  role({ memberOf: ["app_owner"], roleName: "deploy_bot" }),
  role({
    attributes: { canLogin: false },
    memberOf: ["pg_monitor"],
    roleName: "dba_admins",
  }),
  role({
    attributes: { canLogin: false },
    isSystemRole: true,
    roleName: "pg_monitor",
  }),
];

function accessMapFixture(
  overrides: Partial<RoleFixture> & { extraDirectGrantCount?: number } = {}
): RoleFixture {
  const { extraDirectGrantCount = 0, ...rest } = overrides;
  return {
    access: {
      "analytics_reader@billing": {
        grants: [
          {
            objectName: "billing",
            objectType: GrantObjectType.DATABASE,
            privilege: "SELECT on invoices, payments",
          },
        ],
      },
      "app_owner@auth": { ownedObjects: [ownedDatabase("auth")] },
      "app_owner@billing": { ownedObjects: [ownedDatabase("billing")] },
      "app_owner@logistics": { ownedObjects: [ownedDatabase("logistics")] },
      "app_readonly@logistics": {
        defaultPrivileges: [
          {
            creatorRole: `${INSTANCE}/roles/app_owner`,
            creatorRoleName: "app_owner",
            objectType: DefaultPrivilegeObjectType.TABLES,
            privilege: "SELECT",
            schemaName: "shipping",
          },
        ],
        grants: [
          schemaGrant("shipping", "SELECT on all tables"),
          schemaGrant("catalog", "SELECT on all tables"),
          schemaGrant("audit", "SELECT on all tables"),
          ...Array.from({ length: extraDirectGrantCount }, (_, index) =>
            schemaGrant(`extra_${index}`, "USAGE")
          ),
        ],
      },
      "app_readwrite@logistics": {
        grants: [
          schemaGrant("shipping", "SELECT · INSERT · UPDATE · DELETE"),
          schemaGrant("catalog", "SELECT · INSERT · UPDATE · DELETE"),
        ],
      },
      "cloud_admin@functions": {
        grants: [schemaGrant("public", "ALL — superuser")],
      },
    },
    databases: ["logistics", "billing", "auth", "functions"],
    publicGrants: {
      functions: [schemaGrant("public", "USAGE · EXECUTE on functions")],
    },
    roles: ACCESS_MAP_ROLES,
    ...rest,
  };
}

const ROLE_DETAIL_ROLES = [
  role({ memberOf: ["app_writer"], roleName: "app_user" }),
  role({
    attributes: { canLogin: false },
    comment: "Application write group.",
    roleName: "app_writer",
  }),
  role({ memberOf: ["app_user"], roleName: "reporting_reader" }),
];

function tableGrant(objectName: string, privilege: string): GrantInit {
  return {
    grantor: "postgres",
    objectName,
    objectType: GrantObjectType.TABLE,
    privilege,
    schemaName: "public",
  };
}

function roleDetailFixture({
  extraGrants = [],
  ...rest
}: Partial<RoleFixture> & { extraGrants?: GrantInit[] } = {}): RoleFixture {
  return {
    access: {
      "app_user@appdb": {
        defaultPrivileges: [
          {
            creatorRole: `${INSTANCE}/roles/app_owner`,
            creatorRoleName: "app_owner",
            objectType: DefaultPrivilegeObjectType.TABLES,
            privilege: "SELECT",
            schemaName: "analytics",
          },
        ],
        grants: [
          tableGrant("orders", "SELECT"),
          tableGrant("orders", "UPDATE"),
          {
            grantor: "postgres",
            objectName: "daily_revenue",
            objectType: GrantObjectType.VIEW,
            privilege: "SELECT",
            schemaName: "analytics",
            withGrantOption: true,
          },
          ...extraGrants,
        ],
        ownedObjects: [
          {
            objectName: "job_runs",
            objectType: GrantObjectType.TABLE,
            schemaName: "internal",
          },
        ],
      },
    },
    databases: ["appdb"],
    publicGrants: {
      appdb: [{ ...schemaGrant("public", "USAGE"), grantor: "postgres" }],
    },
    roles: ROLE_DETAIL_ROLES,
    ...rest,
  };
}

function leafId(resourceName: string) {
  return resourceName.split("/").at(-1) ?? "";
}

function roleFixtureDatabase(id: string) {
  return create(DatabaseSchema, {
    characterSet: "UTF8",
    collation: "en_US.UTF-8",
    displayName: id,
    name: `${INSTANCE}/databases/${id}`,
    owner: "app_owner",
  });
}

const NEVER = new Promise<never>(() => undefined);

/**
 * Connect service implementations for the role screens. Pass them to
 * `createTestRouterTransport` in rstest or `serveService` in Playwright.
 */
function roleFixtureServices(fixture: RoleFixture) {
  const truncated = new Set(fixture.truncated ?? []);
  const pending = new Set(fixture.pending ?? []);
  const failing = new Set(fixture.failing ?? []);

  function answer<T>(
    rpc: RoleAccessRpc,
    key: string,
    response: () => T
  ): Promise<T> {
    if (pending.has(rpc)) {
      return NEVER;
    }
    if (failing.has(`${rpc}:${key}`)) {
      return Promise.reject(
        new ConnectError("role access unavailable", Code.Unavailable)
      );
    }
    return Promise.resolve(response());
  }
  const nextPageToken = (rpc: RoleAccessRpc) =>
    truncated.has(rpc) ? "next" : "";
  const accessFor = (parent: string, database: string) => {
    const key = `${leafId(parent)}@${leafId(database)}`;
    return { key, value: fixture.access[key] ?? {} };
  };

  const roleService: Partial<ServiceImpl<typeof RoleService>> = {
    listPublicGrants: ({ parent }) =>
      answer("listPublicGrants", leafId(parent), () =>
        create(ListPublicGrantsResponseSchema, {
          grants: fixture.publicGrants[leafId(parent)] ?? [],
          nextPageToken: nextPageToken("listPublicGrants"),
        })
      ),
    listRoleDefaultPrivileges: ({ database, parent }) => {
      const { key, value } = accessFor(parent, database);
      return answer("listRoleDefaultPrivileges", key, () =>
        create(ListRoleDefaultPrivilegesResponseSchema, {
          defaultPrivileges: value.defaultPrivileges ?? [],
          nextPageToken: nextPageToken("listRoleDefaultPrivileges"),
        })
      );
    },
    listRoleGrants: ({ database, parent }) => {
      const { key, value } = accessFor(parent, database);
      return answer("listRoleGrants", key, () =>
        create(ListRoleGrantsResponseSchema, {
          grants: value.grants ?? [],
          nextPageToken: nextPageToken("listRoleGrants"),
        })
      );
    },
    listRoleOwnedObjects: ({ database, parent }) => {
      const { key, value } = accessFor(parent, database);
      return answer("listRoleOwnedObjects", key, () =>
        create(ListRoleOwnedObjectsResponseSchema, {
          nextPageToken: nextPageToken("listRoleOwnedObjects"),
          ownedObjects: value.ownedObjects ?? [],
        })
      );
    },
    listRoles: () =>
      create(ListRolesResponseSchema, {
        roles: fixture.roles.map((init) => create(RoleSchema, init)),
      }),
  };
  const databaseService: Partial<ServiceImpl<typeof DatabaseService>> = {
    getDatabase: ({ name }) =>
      create(GetDatabaseResponseSchema, {
        database: roleFixtureDatabase(leafId(name)),
      }),
    listDatabases: () =>
      create(ListDatabasesResponseSchema, {
        databases: fixture.databases.map(roleFixtureDatabase),
      }),
  };

  return { database: databaseService, role: roleService };
}

export type { RoleAccessRpc, RoleFixture };
export {
  accessMapFixture,
  ROLE_FIXTURE_INSTANCE_ID,
  ROLES_TABLE_ROLES,
  role,
  roleDetailFixture,
  roleFixtureDatabase,
  roleFixtureServices,
};
