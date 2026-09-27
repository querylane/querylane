import type { Page } from "playwright/test";
import {
  mockApiManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  mockRoles,
  mockRpcWith,
  sampleDatabase,
  sampleInstance,
} from "../tests/helpers";

// Proto3 JSON fixtures for the roles screens. The access map mirrors the
// design source (`AMAP_ROLES`, `AMAP_OBJS`, `AMAP_EDGES`); privilege strings are
// kept verbatim from it so the map reads the same as the design.

const INSTANCE = "instances/production";

interface JsonGrant {
  grantor?: string;
  objectName: string;
  objectType: string;
  privilege: string;
  schemaName: string;
  withGrantOption: boolean;
}

interface JsonOwnedObject {
  objectName: string;
  objectType: string;
  schemaName: string;
}

interface JsonDefaultPrivilege {
  creatorRole: string;
  creatorRoleName: string;
  objectType: string;
  privilege: string;
  schemaName: string;
  withGrantOption: boolean;
}

type RoleAccessRpc =
  | "ListPublicGrants"
  | "ListRoleDefaultPrivileges"
  | "ListRoleGrants"
  | "ListRoleOwnedObjects";

interface RoleDatabaseAccess {
  defaultPrivileges?: JsonDefaultPrivilege[];
  grants?: JsonGrant[];
  ownedObjects?: JsonOwnedObject[];
}

interface RoleAccessFixture {
  /** Keyed by `${roleId}@${databaseId}`. */
  access: Record<string, RoleDatabaseAccess>;
  databases: string[];
  /** Keyed by database id. */
  publicGrants: Record<string, JsonGrant[]>;
  /** RPCs that report another page, so their results render as partial. */
  truncated?: readonly RoleAccessRpc[];
}

function roleAttributes(overrides: Record<string, unknown> = {}) {
  return {
    bypassesRls: false,
    canCreateDatabase: false,
    canCreateRole: false,
    canLogin: true,
    canReplicate: false,
    connectionLimit: -1,
    inheritsByDefault: true,
    isSuperuser: false,
    ...overrides,
  };
}

function membership(roleName: string) {
  return {
    adminOption: false,
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
  attributes?: Record<string, unknown>;
  comment?: string;
  isSystemRole?: boolean;
  memberOf?: string[];
  roleName: string;
}) {
  return {
    attributes: roleAttributes(attributes),
    comment,
    isSystemRole,
    memberOf: memberOf.map(membership),
    name: `${INSTANCE}/roles/${roleName}`,
    roleName,
  };
}

function database(id: string) {
  return {
    ...sampleDatabase,
    displayName: id,
    name: `${INSTANCE}/databases/${id}`,
  };
}

function schemaGrant(schemaName: string, privilege: string): JsonGrant {
  return {
    objectName: "",
    objectType: "GRANT_OBJECT_TYPE_SCHEMA",
    privilege,
    schemaName,
    withGrantOption: false,
  };
}

function ownedDatabase(id: string): JsonOwnedObject {
  return {
    objectName: id,
    objectType: "GRANT_OBJECT_TYPE_DATABASE",
    schemaName: "",
  };
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

function accessMapFixture(extraDirectGrantCount = 0): RoleAccessFixture {
  return {
    access: {
      "analytics_reader@billing": {
        grants: [
          {
            objectName: "billing",
            objectType: "GRANT_OBJECT_TYPE_DATABASE",
            privilege: "SELECT on invoices, payments",
            schemaName: "",
            withGrantOption: false,
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
            objectType: "DEFAULT_PRIVILEGE_OBJECT_TYPE_TABLES",
            privilege: "SELECT",
            schemaName: "shipping",
            withGrantOption: false,
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

function roleDetailFixture({
  extraGrants = [],
  truncated,
}: {
  extraGrants?: JsonGrant[];
  truncated?: RoleAccessFixture["truncated"];
} = {}): RoleAccessFixture {
  const tableGrant = (objectName: string, privilege: string): JsonGrant => ({
    grantor: "postgres",
    objectName,
    objectType: "GRANT_OBJECT_TYPE_TABLE",
    privilege,
    schemaName: "public",
    withGrantOption: false,
  });
  return {
    access: {
      "app_user@appdb": {
        defaultPrivileges: [
          {
            creatorRole: `${INSTANCE}/roles/app_owner`,
            creatorRoleName: "app_owner",
            objectType: "DEFAULT_PRIVILEGE_OBJECT_TYPE_TABLES",
            privilege: "SELECT",
            schemaName: "analytics",
            withGrantOption: false,
          },
        ],
        grants: [
          tableGrant("orders", "SELECT"),
          tableGrant("orders", "UPDATE"),
          {
            grantor: "postgres",
            objectName: "daily_revenue",
            objectType: "GRANT_OBJECT_TYPE_VIEW",
            privilege: "SELECT",
            schemaName: "analytics",
            withGrantOption: true,
          },
          ...extraGrants,
        ],
        ownedObjects: [
          {
            objectName: "job_runs",
            objectType: "GRANT_OBJECT_TYPE_TABLE",
            schemaName: "internal",
          },
        ],
      },
    },
    databases: ["appdb"],
    publicGrants: {
      appdb: [{ ...schemaGrant("public", "USAGE"), grantor: "postgres" }],
    },
    ...(truncated ? { truncated } : {}),
  };
}

function leafId(resourceName: unknown) {
  return typeof resourceName === "string"
    ? (resourceName.split("/").at(-1) ?? "")
    : "";
}

async function mockReadyInstanceShell(page: Page, databaseIds: string[]) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, databaseIds.map(database));
  const [firstDatabaseId = sampleDatabase.displayName] = databaseIds;
  await mockDatabaseDetails(page, database(firstDatabaseId));
}

async function mockRoleAccess(page: Page, fixture: RoleAccessFixture) {
  const truncated = new Set(fixture.truncated ?? []);
  const pageToken = (method: RoleAccessRpc) =>
    truncated.has(method) ? "next" : "";
  const accessFor = (request: Record<string, unknown>) =>
    fixture.access[
      `${leafId(request["parent"])}@${leafId(request["database"])}`
    ] ?? {};

  await mockRpcWith(page, "RoleService/ListPublicGrants", (request) => ({
    grants: fixture.publicGrants[leafId(request["parent"])] ?? [],
    nextPageToken: pageToken("ListPublicGrants"),
  }));
  await mockRpcWith(page, "RoleService/ListRoleGrants", (request) => ({
    grants: accessFor(request).grants ?? [],
    nextPageToken: pageToken("ListRoleGrants"),
  }));
  await mockRpcWith(page, "RoleService/ListRoleOwnedObjects", (request) => ({
    nextPageToken: pageToken("ListRoleOwnedObjects"),
    ownedObjects: accessFor(request).ownedObjects ?? [],
  }));
  await mockRpcWith(
    page,
    "RoleService/ListRoleDefaultPrivileges",
    (request) => ({
      defaultPrivileges: accessFor(request).defaultPrivileges ?? [],
      nextPageToken: pageToken("ListRoleDefaultPrivileges"),
    })
  );
}

async function mockRolesScreen(
  page: Page,
  {
    fixture,
    roles,
  }: {
    fixture: RoleAccessFixture;
    roles: Parameters<typeof mockRoles>[1];
  }
) {
  await mockReadyInstanceShell(page, fixture.databases);
  await mockRoles(page, roles);
  await mockRoleAccess(page, fixture);
}

export {
  ACCESS_MAP_ROLES,
  accessMapFixture,
  mockRolesScreen,
  ROLE_DETAIL_ROLES,
  ROLES_TABLE_ROLES,
  roleDetailFixture,
};
