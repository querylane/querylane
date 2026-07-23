import type { Page, Route } from "playwright/test";
import { expect, test } from "./base";
import { mockExplorerShell, mockTableCatalog } from "./data-explorer-fixtures";
import {
  fulfillJson,
  mockApiManagedReadyConsole,
  mockConfigManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyAppWithDeletableInstance,
  mockReadyAppWithInstance,
  mockReadyOnboarding,
  mockRoles,
  mockRpc,
  mockRpcError,
  sampleDatabase,
  sampleInstance,
} from "./helpers";

const NEW_INSTANCE_URL_RE = /\/new-instance$/;
const REPLICATOR_ROLE_RE = /replicator/;
const AUDITOR_ROLE_RE = /auditor/;
const PRODUCTION_CONFIGURATION_URL_RE =
  /\/instances\/production\/configuration\/?$/;
const APPDB_DATABASE_URL_RE = /\/instances\/production\/databases\/appdb\/?$/;
const MISSING_DATABASE_URL_RE =
  /\/instances\/production\/databases\/missing\/?$/;
const APPDB_EXPLORER_URL_RE =
  /\/instances\/production\/databases\/appdb\/explorer/;
const LAST_CHECKED_LABEL_RE = /Last checked/;

const INSTANCE_HEALTH_CHECK_TIME = "2026-05-21T10:15:00Z";
const METRIC_UNAVAILABLE_ERROR_CODE = 14;

function metricPartialError(metric: string, message: string) {
  return {
    code: METRIC_UNAVAILABLE_ERROR_CODE,
    details: [],
    message: `${message} (${metric})`,
  };
}

async function expectMainScreenshot(page: Page, name: string) {
  await expect(page.getByRole("main").nth(1)).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.03,
  });
}

type RpcRouteHandler = (route: Route) => Promise<void>;

async function routeRpcMethod(
  page: Page,
  method: string,
  handler: RpcRouteHandler
) {
  await page.route(`**/${method}`, handler);
  await page.route(`**.${method}`, handler);
}

async function routeSuccessfulUpdateInstance(
  page: Page,
  onBody: (body: Record<string, unknown>) => void
) {
  await routeRpcMethod(page, "UpdateInstance", async (route) => {
    onBody(route.request().postDataJSON());
    await fulfillJson(route, { instance: sampleInstance });
  });
}

test("database overview: renders backend metadata for selected database", {
  tag: ["@smoke", "@feat:database", "@flow:query"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page, {
    ...sampleDatabase,
    displayName: "analytics",
    name: "instances/production/databases/analytics",
    owner: "analytics_owner",
  });

  await page.goto("/instances/production/databases/analytics");

  await expect(page.getByRole("heading", { name: "analytics" })).toBeVisible();
  await expect(page.getByText("analytics_owner")).toBeVisible();
  await expect(page.getByText("UTF8")).toBeVisible();
});

test("instance overview: disconnected instance keeps databases unavailable", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  const disconnectedInstance = {
    ...sampleInstance,
    connectionError: "authentication failed",
    connectionState: "CONNECTION_STATE_ERROR",
  };
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [disconnectedInstance]);
  await mockInstanceDetails(page, disconnectedInstance);
  await mockDatabases(page, []);

  await page.goto("/instances/production");

  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
  await expect(page.getByText("Databases unavailable")).toBeVisible();
  await expect(
    page.getByText(
      "Database list is unavailable while this instance is not connected."
    )
  ).toBeVisible();
});

test("instance overview visual: connection failure details are stable", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  const disconnectedInstance = {
    ...sampleInstance,
    connectionError: "password authentication failed for user postgres",
    connectionState: "CONNECTION_STATE_ERROR",
    lastConnectionCheckTime: INSTANCE_HEALTH_CHECK_TIME,
  };
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [disconnectedInstance]);
  await mockInstanceDetails(page, disconnectedInstance);
  await mockDatabases(page, []);

  await page.goto("/instances/production");

  await expect(page.getByText("Connection failed")).toBeVisible();
  await expect(page.getByText("Connection error:")).toBeVisible();
  await expect(page.getByLabel("Copy connection error")).toBeVisible();
  await expect(page.getByText(LAST_CHECKED_LABEL_RE)).toBeVisible();
  await expectMainScreenshot(page, "instance-health-connection-failed.png");
});

test("instance overview visual: partial metric errors are stable", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  const checkedInstance = {
    ...sampleInstance,
    lastConnectionCheckTime: INSTANCE_HEALTH_CHECK_TIME,
  };
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [checkedInstance]);
  await mockInstanceDetails(page, checkedInstance);
  await mockRpc(page, "InstanceService/GetInstanceOverview", {
    instanceOverview: {
      connections: { maxConnections: 100, totalConnections: 12 },
      observedAt: INSTANCE_HEALTH_CHECK_TIME,
    },
    partialErrors: [
      metricPartialError("cache", "failed to query cache metrics"),
      metricPartialError("storage", "failed to query storage metrics"),
    ],
  });
  await mockDatabases(page, [sampleDatabase]);

  await page.goto("/instances/production");

  await expect(page.getByText("failed to query cache metrics")).toBeVisible();
  await expect(page.getByText("failed to query storage metrics")).toBeVisible();
  await expectMainScreenshot(page, "instance-health-partial-metrics.png");
});

test("database overview: direct deep link loads selected database shell", {
  tag: ["@feat:database", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page, sampleDatabase);

  await page.goto("/instances/production/databases/appdb");

  await expect(page.getByRole("heading", { name: "appdb" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Production Postgres" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "appdb" })).toBeVisible();
  await expect(page).toHaveURL(APPDB_DATABASE_URL_RE);
});

test("database overview: not found keeps database route context", {
  tag: ["@feat:database", "@flow:error"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await page.route("**/DatabaseService/GetDatabase", async (route) => {
    await fulfillJson(
      route,
      { code: "not_found", message: "database not found" },
      404
    );
  });
  await page.route("**.DatabaseService/GetDatabase", async (route) => {
    await fulfillJson(
      route,
      { code: "not_found", message: "database not found" },
      404
    );
  });

  await page.goto("/instances/production/databases/missing");

  await expect(
    page.getByRole("heading", { name: "Database not found" })
  ).toBeVisible();
  await expect(
    page.getByText("This database is no longer available from the backend.")
  ).toBeVisible();
  await expect(page).toHaveURL(MISSING_DATABASE_URL_RE);
});

test("database overview: partial metadata renders placeholders", {
  tag: ["@feat:database", "@flow:query"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page, {
    displayName: "emptydb",
    isSystemDatabase: false,
    name: "instances/production/databases/emptydb",
  });

  await page.goto("/instances/production/databases/emptydb");

  await expect(page.getByRole("heading", { name: "emptydb" })).toBeVisible();
  await expect(page.getByText("—").first()).toBeVisible();
  await expect(page.getByText("No")).toBeVisible();
});

test("database overview: opens explorer for selected database", {
  tag: ["@feat:database", "@flow:navigate"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockTableCatalog(page);

  await page.goto("/instances/production/databases/appdb");
  await page.getByRole("link", { name: "Open data explorer" }).click();

  await expect(page).toHaveURL(APPDB_EXPLORER_URL_RE);
  await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
});

test("database overview: backend error renders retryable route error", {
  tag: ["@feat:database", "@flow:error"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await page.route("**/DatabaseService/GetDatabase", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "database metadata offline" },
      500
    );
  });
  await page.route("**.DatabaseService/GetDatabase", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "database metadata offline" },
      500
    );
  });

  await page.goto("/instances/production/databases/appdb");

  await expect(page.getByText("database metadata offline")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page).toHaveURL(APPDB_DATABASE_URL_RE);
});

test("roles: mock roles table supports filtering without backend calls", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await mockRoles(page);
  await page.goto("/instances/production/roles");

  await expect(
    page.getByRole("heading", { level: 1, name: "Roles" })
  ).toBeVisible();
  await expect(page.getByText("app_user")).toBeVisible();

  await page.getByPlaceholder("Search roles...").fill("replicator");

  await expect(
    page.getByRole("cell", { name: REPLICATOR_ROLE_RE })
  ).toBeVisible();
  await expect(page.getByText("app_user")).toBeHidden();
});

test("roles: sortable header announces the current sort direction", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await mockRoles(page);
  await page.goto("/instances/production/roles");

  const ascendingHeader = page.getByRole("button", {
    name: "Role, sorted ascending",
  });
  await expect(ascendingHeader).toBeVisible();

  await ascendingHeader.click();

  await expect(
    page.getByRole("button", { name: "Role, sorted descending" })
  ).toBeVisible();
});

test("roles: empty list renders role-specific empty state", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);
  await mockRoles(page, []);

  await page.goto("/instances/production/roles");

  await expect(
    page.getByRole("heading", { level: 1, name: "Roles & Users" })
  ).toBeVisible();
  await expect(
    page.getByText("0 roles · 0 can log in · 0 groups")
  ).toBeVisible();
  await expect(page.getByText("No roles found")).toBeVisible();
});

test("roles: backend error renders retryable route error", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);
  await mockRpcError({
    page,
    method: "RoleService/ListRoles",
    message: "roles metadata offline",
  });
  await mockRpcError({
    page,
    method: "ListRoles",
    message: "roles metadata offline",
  });

  await page.goto("/instances/production/roles");

  await expect(page.getByText("roles metadata offline")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("roles: renders permissions, special attributes, and memberships", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);
  await mockRoles(page, [
    {
      attributes: {
        bypassesRls: true,
        canCreateDatabase: true,
        canCreateRole: true,
        canLogin: false,
        canReplicate: true,
        connectionLimit: 3,
        inheritsByDefault: false,
        isSuperuser: true,
      },
      isSystemRole: true,
      memberOf: [
        { adminOption: true, roleName: "security_admin" },
        { roleName: "readonly" },
      ],
      name: "instances/production/roles/auditor",
      roleName: "auditor",
    },
  ]);

  await page.goto("/instances/production/roles");

  await expect(page.getByRole("cell", { name: AUDITOR_ROLE_RE })).toBeVisible();
  await expect(page.getByRole("cell", { name: "No" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "3" })).toBeVisible();
  await expect(page.getByText("Built-in role", { exact: true })).toBeVisible();
});

test("roles: filter resets after leaving and returning to roles", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);
  await mockRoles(page);
  await page.goto("/instances/production/roles");

  await page.getByPlaceholder("Search roles...").fill("replicator");
  await expect(page.getByText("app_user")).toBeHidden();

  // Instance + database nav both expose an "Overview" link (a database is now
  // auto-selected), so target the instance overview specifically.
  await page.getByRole("link", { name: "Overview" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Production Postgres" })
  ).toBeVisible();
  await page.getByRole("link", { name: "Roles" }).click();

  await expect(page.getByPlaceholder("Search roles...")).toHaveValue("");
  await expect(page.getByText("app_user")).toBeVisible();
  await expect(page.getByText("replicator", { exact: true })).toBeVisible();
});

test("instance configuration: saves changed connection fields with field mask", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);

  let updateBody: Record<string, unknown> | undefined;
  await routeSuccessfulUpdateInstance(page, (body) => {
    updateBody = body;
  });

  await page.goto("/instances/production/configuration");
  await page.getByRole("textbox", { name: "Host" }).fill("db.internal");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Instance configuration saved.")).toBeVisible();
  expect(updateBody?.["updateMask"]).toBe("config.host");
});

test("instance configuration: API error stays inline and keeps form editable", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);
  await routeRpcMethod(page, "UpdateInstance", async (route) => {
    await fulfillJson(route, { code: "internal", message: "save failed" }, 500);
  });

  await page.goto("/instances/production/configuration");
  await page.getByRole("textbox", { name: "Host" }).fill("db.internal");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("save failed")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Host" })).toBeEditable();
});

test("instance configuration: config-managed instances render read-only notice", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockConfigManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);

  await page.goto("/instances/production/configuration");

  await expect(page.getByText("Managed via configuration file")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Host" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
});

test("instance configuration: delete confirmation requires matching display name", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await page.goto("/instances/production/configuration");

  let deleteCalls = 0;
  await routeRpcMethod(page, "DeleteInstance", async (route) => {
    deleteCalls += 1;
    await fulfillJson(route, {});
  });

  await page.getByRole("button", { name: "Delete instance" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: "Delete instance?" });
  await dialog
    .getByLabel("Type Production Postgres to confirm")
    .fill("production");
  await expect(
    dialog.getByRole("button", { name: "Delete instance" })
  ).toBeDisabled();

  await dialog
    .getByLabel("Type Production Postgres to confirm")
    .fill("Production Postgres");
  await dialog.getByRole("button", { name: "Delete instance" }).click();

  await expect.poll(() => deleteCalls).toBe(1);
});

test("instance configuration: config-managed instances block mutation API paths", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockConfigManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);

  let mutationCalls = 0;
  await routeRpcMethod(page, "UpdateInstance", async (route) => {
    mutationCalls += 1;
    await fulfillJson(route, { instance: sampleInstance });
  });
  await routeRpcMethod(page, "DeleteInstance", async (route) => {
    mutationCalls += 1;
    await fulfillJson(route, {});
  });

  await page.goto("/instances/production/configuration");

  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await expect(page.getByTestId("instance-danger-zone")).toBeHidden();
  await expect.poll(() => mutationCalls).toBe(0);
});

test("instance configuration: saves label mutations with labels field mask", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);

  let updateBody: Record<string, unknown> | undefined;
  await routeSuccessfulUpdateInstance(page, (body) => {
    updateBody = body;
  });

  await page.goto("/instances/production/configuration");
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByPlaceholder("Key").nth(1).fill("region");
  await page.getByPlaceholder("Value").nth(1).fill("eu");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Instance configuration saved.")).toBeVisible();
  expect(updateBody?.["updateMask"]).toBe("labels");
  expect(updateBody?.["instance"]).toMatchObject({
    labels: { env: "prod", region: "eu" },
  });
});

test("instance configuration: delete API error keeps instance page open", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await page.goto("/instances/production/configuration");

  await routeRpcMethod(page, "DeleteInstance", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "delete failed" },
      500
    );
  });

  await page.getByRole("button", { name: "Delete instance" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: "Delete instance?" });
  await dialog
    .getByLabel("Type Production Postgres to confirm")
    .fill("Production Postgres");
  await dialog.getByRole("button", { name: "Delete instance" }).click();

  await expect(page.getByText("delete failed")).toBeVisible();
  await expect(page).toHaveURL(PRODUCTION_CONFIGURATION_URL_RE);
});

test("instance configuration: delete removes instance and navigates to empty create flow", {
  tag: ["@feat:instances", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await page.goto("/instances/production/configuration");

  await routeRpcMethod(page, "DeleteInstance", async (route) =>
    fulfillJson(route, {})
  );
  await mockInstanceCatalog(page, []);

  await page.getByRole("button", { name: "Delete instance" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: "Delete instance?" });
  await dialog
    .getByLabel("Type Production Postgres to confirm")
    .fill("Production Postgres");
  await dialog.getByRole("button", { name: "Delete instance" }).click();

  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
});

test("instance navigation: sidebar opens configuration from overview", {
  tag: ["@feat:instances", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);
  await page.goto("/instances/production");

  await page.getByRole("link", { name: "Configuration" }).click();

  await expect(page).toHaveURL(PRODUCTION_CONFIGURATION_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Danger zone" })
  ).toBeVisible();
});

test("instance configuration: cancel delete keeps instance page open", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await page.goto("/instances/production/configuration");

  await page.getByRole("button", { name: "Delete instance" }).first().click();
  await page
    .getByRole("alertdialog", { name: "Delete instance?" })
    .getByRole("button", { name: "Cancel" })
    .click();

  await expect(page).toHaveURL(PRODUCTION_CONFIGURATION_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
});
