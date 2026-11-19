import type { Page } from "playwright/test";
import { connectStreamResponse } from "../visual/connect-rpc.test-utils";
import { mockRpc, mockRpcStream } from "./msw-network.test-utils";

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

async function mockEmptyInstanceCatalog(page: Page) {
  await mockRpc(page, "InstanceService/ListInstances", {
    instances: [],
    nextPageToken: "",
  });
}

async function mockApiManagedConsoleConfig(page: Page) {
  await mockRpc(page, "ConsoleService/GetConsoleConfig", {
    databaseStatus: { schemaVersion: 0, state: "STATE_NOT_CONFIGURED" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_API",
  });
}

const sampleInstance = {
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

const sampleReportingInstance = {
  ...sampleInstance,
  config: {
    ...sampleInstance.config,
    host: "reporting.db.local",
  },
  displayName: "Reporting Postgres",
  labels: { env: "reporting" },
  name: "instances/reporting",
};

const sampleDatabase = {
  characterSet: "UTF8",
  collation: "en_US.UTF-8",
  displayName: "appdb",
  isSystemDatabase: false,
  name: "instances/production/databases/appdb",
  owner: "app_owner",
};

const sampleRoles: MockRole[] = [
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

async function mockReadyOnboarding(page: Page) {
  await mockRpc(page, "OnboardingService/GetOnboardingState", {
    appDatabaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    availableMethods: [],
    configFilePath: "/tmp/querylane/config.yaml",
    homePath: "/tmp/querylane",
    isConfigured: true,
    isHomeWritable: true,
  });
}

async function mockApiManagedReadyConsole(page: Page) {
  await mockRpc(page, "ConsoleService/GetConsoleConfig", {
    databaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_API",
  });
}

async function mockConfigManagedReadyConsole(page: Page) {
  await mockRpc(page, "ConsoleService/GetConsoleConfig", {
    databaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_CONFIG",
  });
}

async function mockInstanceCatalog(page: Page, instances: unknown[]) {
  await mockRpc(page, "InstanceService/ListInstances", {
    instances,
    nextPageToken: "",
  });
}

async function mockInstanceDetails(
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
    instanceOverview: {
      cache: { hitRatio: 0.97 },
      connections: { maxConnections: 100, totalConnections: 12 },
      storage: { totalSizeBytes: "104857600" },
    },
  });
}

async function mockDatabases(page: Page, databases: unknown[] = []) {
  await mockRpc(page, "DatabaseService/ListDatabases", {
    databases,
    nextPageToken: "",
  });
}

async function mockDatabaseDetails(
  page: Page,
  database: Record<string, unknown> = sampleDatabase
) {
  await mockRpc(page, "DatabaseService/GetDatabase", {
    database,
  });
}

async function mockOverviewSupportData(page: Page) {
  await mockRpc(page, "MetricsService/QueryMetrics", {});
  await mockRpc(page, "InstanceService/CheckInstanceHealth", {});
  await mockRpc(page, "ExtensionService/ListExtensions", { extensions: [] });
  await mockRpc(page, "SchemaService/ListSchemas", { schemas: [] });
  await mockRpc(page, "DatabaseService/GetDatabaseQueryInsights", {});
  await mockRpcStream(page, "SQLService/ExecuteQuery", {
    respond: () => connectStreamResponse([]),
  });
}

async function mockRoles(page: Page, roles: MockRole[] = sampleRoles) {
  const body = { nextPageToken: "", roles };
  await mockRpc(page, "RoleService/ListRoles", body);
  await mockRpc(page, "ListRoles", body);
}

async function mockReadyEmptyApp(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, []);
}

async function mockReadyAppWithInstance(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
}

async function mockReadyAppWithDeletableInstance(page: Page) {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance, sampleReportingInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
}

export {
  mockApiManagedConsoleConfig,
  mockApiManagedReadyConsole,
  mockConfigManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockEmptyInstanceCatalog,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockOverviewSupportData,
  mockReadyAppWithDeletableInstance,
  mockReadyAppWithInstance,
  mockReadyEmptyApp,
  mockReadyOnboarding,
  mockRoles,
  sampleDatabase,
  sampleInstance,
  sampleReportingInstance,
};
