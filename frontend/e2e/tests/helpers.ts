import type { Page, Route } from "playwright/test";

const JSON_HEADERS = { "Content-Type": "application/json" };

interface MockRoleMembership {
  adminOption?: boolean;
  grantor?: string;
  inheritOption?: boolean;
  roleName: string;
  setOption?: boolean;
}

interface MockRoleAttributes {
  bypassesRls: boolean;
  canCreateDatabase: boolean;
  canCreateRole: boolean;
  canLogin: boolean;
  canReplicate: boolean;
  connectionLimit: number;
  inheritsByDefault: boolean;
  isSuperuser: boolean;
}

interface MockRole {
  attributes: MockRoleAttributes;
  isSystemRole: boolean;
  memberOf: MockRoleMembership[];
  name: string;
  roleName: string;
}

export async function fulfillJson(
  route: Route,
  body: Record<string, unknown>,
  status = 200
) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
    status,
  });
}

/**
 * Intercept a QueryLane Connect-protocol RPC and return proto3 JSON.
 * QueryLane currently uses Connect JSON encoding in the browser transport;
 * these smoke tests intentionally mock that wire format.
 */
export async function mockRpc(
  page: Page,
  method: string,
  body: Record<string, unknown>
) {
  await page.route(`**/${method}`, async (route) => fulfillJson(route, body));
  await page.route(`**.${method}`, async (route) => fulfillJson(route, body));
}

export async function mockRpcOnce(
  page: Page,
  method: string,
  body: Record<string, unknown>
) {
  await page.route(`**/${method}`, async (route) => fulfillJson(route, body), {
    times: 1,
  });
  await page.route(`**.${method}`, async (route) => fulfillJson(route, body), {
    times: 1,
  });
}

export async function mockRpcError(
  page: Page,
  method: string,
  message: string,
  status = 500
) {
  const body = { code: "internal", message };
  await page.route(`**/${method}`, async (route) =>
    fulfillJson(route, body, status)
  );
  await page.route(`**.${method}`, async (route) =>
    fulfillJson(route, body, status)
  );
}

export async function mockEmptyInstanceCatalog(page: Page) {
  await mockRpc(page, "InstanceService/ListInstances", {
    instances: [],
    nextPageToken: "",
  });
}

export async function mockApiManagedConsoleConfig(page: Page) {
  await mockRpc(page, "ConsoleService/GetConsoleConfig", {
    databaseStatus: { schemaVersion: 0, state: "STATE_NOT_CONFIGURED" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_API",
  });
}

export const sampleInstance = {
  config: {
    database: "postgres",
    host: "db.local",
    password: "secret",
    port: 5432,
    sslMode: 3,
    username: "postgres",
  },
  connectionState: "CONNECTION_STATE_ACTIVE",
  displayName: "Production Postgres",
  labels: { env: "prod" },
  name: "instances/production",
};

export const sampleReportingInstance = {
  ...sampleInstance,
  config: {
    ...sampleInstance.config,
    host: "reporting.db.local",
  },
  displayName: "Reporting Postgres",
  labels: { env: "reporting" },
  name: "instances/reporting",
};

export const sampleDatabase = {
  characterSet: "UTF8",
  collation: "en_US.UTF-8",
  displayName: "appdb",
  isSystemDatabase: false,
  name: "instances/production/databases/appdb",
  owner: "app_owner",
};

export const sampleRoles: MockRole[] = [
  {
    attributes: {
      bypassesRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      canReplicate: false,
      connectionLimit: -1,
      inheritsByDefault: true,
      isSuperuser: false,
    },
    isSystemRole: false,
    memberOf: [{ roleName: "app_writer" }],
    name: "instances/production/roles/app_user",
    roleName: "app_user",
  },
  {
    attributes: {
      bypassesRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      canReplicate: true,
      connectionLimit: -1,
      inheritsByDefault: true,
      isSuperuser: false,
    },
    isSystemRole: false,
    memberOf: [],
    name: "instances/production/roles/replicator",
    roleName: "replicator",
  },
];

export async function mockReadyOnboarding(page: Page) {
  await mockRpc(page, "OnboardingService/GetOnboardingState", {
    availableMethods: [],
    configFilePath: "/tmp/querylane/config.yaml",
    homePath: "/tmp/querylane",
    isHomeWritable: true,
    state: "ONBOARDING_STATE_READY",
  });
}

export async function mockApiManagedReadyConsole(page: Page) {
  await mockRpc(page, "ConsoleService/GetConsoleConfig", {
    databaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_API",
  });
}

export async function mockConfigManagedReadyConsole(page: Page) {
  await mockRpc(page, "ConsoleService/GetConsoleConfig", {
    databaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_CONFIG",
  });
}

export async function mockInstanceCatalog(page: Page, instances: unknown[]) {
  await mockRpc(page, "InstanceService/ListInstances", {
    instances,
    nextPageToken: "",
  });
}

export async function mockInstanceDetails(
  page: Page,
  instance: Record<string, unknown> = sampleInstance
) {
  await mockRpc(page, "InstanceService/GetInstance", {
    instance,
    serverInfo: {
      maxConnections: 100,
      replicationRole: "REPLICATION_ROLE_PRIMARY",
      version: "PostgreSQL 16.3",
      versionNum: 160_003,
      versionShort: "16.3",
    },
  });
  await mockRpc(page, "InstanceService/GetInstanceOverview", {
    overview: {
      cache: { hitRatio: 0.97 },
      connections: { maxConnections: 100, totalConnections: 12 },
      storage: { totalSizeBytes: "104857600" },
    },
  });
}

export async function mockDatabases(page: Page, databases: unknown[] = []) {
  await mockRpc(page, "DatabaseService/ListDatabases", {
    databases,
    nextPageToken: "",
  });
}

export async function mockDatabaseDetails(
  page: Page,
  database: Record<string, unknown> = sampleDatabase
) {
  await mockRpc(page, "DatabaseService/GetDatabase", {
    database,
  });
}

export async function mockRoles(page: Page, roles: MockRole[] = sampleRoles) {
  const body = { nextPageToken: "", roles };
  await mockRpc(page, "RoleService/ListRoles", body);
  await mockRpc(page, "ListRoles", body);
}

export async function mockReadyEmptyApp(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, []);
}

export async function mockReadyAppWithInstance(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
}

export async function mockReadyAppWithDeletableInstance(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance, sampleReportingInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
}
