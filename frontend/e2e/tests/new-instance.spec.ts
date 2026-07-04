import type { Page } from "playwright/test";
import { expect, test } from "./base";
import {
  fulfillJson,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyAppWithDeletableInstance,
  mockReadyEmptyApp,
  mockRpc,
  sampleDatabase,
  sampleInstance,
} from "./helpers";

const INVALID_DSN_RE = /Invalid DSN/i;
const NEW_INSTANCE_URL_RE = /\/new-instance$/;
const PRODUCTION_APPDB_EXPLORER_URL_RE =
  /\/instances\/production\/databases\/appdb\/explorer\/?$/;

async function gotoCreateInstance(page: Page) {
  await mockReadyEmptyApp(page);
  await page.goto("/new-instance");
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
}

async function fillRequiredInstanceFields(page: Page) {
  await page.getByLabel("Display name").fill("Production Postgres");
  await page.getByLabel("Host").fill("db.local");
  await page.getByLabel("Port").fill("5432");
  await page.getByLabel("Database").fill("postgres");
  await page.getByLabel("Username").fill("postgres");
  await page.getByRole("textbox", { name: "Password" }).fill("secret");
}

async function mockTestConnection(page: Page) {
  await page.route("**/TestInstanceConnection", async (route) => {
    await fulfillJson(route, {});
  });
  await page.route("**.TestInstanceConnection", async (route) => {
    await fulfillJson(route, {});
  });
}

async function testConnection(page: Page) {
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connection successful.")).toBeVisible();
}

test("new instance: validates required fields before submit", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await gotoCreateInstance(page);

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect(page.getByText("Display name is required.")).toBeVisible();
});

test("new instance: invalid DSN shows inline error and keeps form editable", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  await gotoCreateInstance(page);

  await page.getByLabel("Connection string").fill("not-a-postgres-dsn");
  await page.getByRole("button", { name: "Apply DSN" }).click();

  await expect(page.getByText(INVALID_DSN_RE)).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeEditable();
});

test("new instance: DSN prefill populates connection fields", {
  tag: ["@feat:instances", "@flow:create"],
}, async ({ page }) => {
  await gotoCreateInstance(page);

  await page
    .getByLabel("Connection string")
    .fill("postgres://alice:s3cret@db.example.com:6543/app?sslmode=require");
  await page.getByRole("button", { name: "Apply DSN" }).click();

  await expect(page.getByLabel("Host")).toHaveValue("db.example.com");
  await expect(page.getByLabel("Port")).toHaveValue("6543");
  await expect(page.getByLabel("Database")).toHaveValue("app");
  await expect(page.getByLabel("Username")).toHaveValue("alice");
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue(
    "s3cret"
  );
});

test("new instance: DSN SSL mode is sent with create request", {
  tag: ["@feat:instances", "@flow:create"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, []);
  await mockTestConnection(page);

  let createBody: Record<string, unknown> | undefined;
  await page.route("**/CreateInstance", async (route) => {
    createBody = route.request().postDataJSON();
    await fulfillJson(route, { instance: sampleInstance });
  });
  await page.route("**.CreateInstance", async (route) => {
    createBody = route.request().postDataJSON();
    await fulfillJson(route, { instance: sampleInstance });
  });

  await page.getByLabel("Display name").fill("Production Postgres");
  await page
    .getByLabel("Connection string")
    .fill(
      "postgres://alice:s3cret@db.example.com:6543/app?sslmode=verify-full"
    );
  await page.getByRole("button", { name: "Apply DSN" }).click();
  await expect(page.getByLabel("Host")).toHaveValue("db.example.com");
  await expect(page.getByLabel("Port")).toHaveValue("6543");
  await expect(page.getByLabel("Database")).toHaveValue("app");
  await expect(page.getByLabel("Username")).toHaveValue("alice");
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue(
    "s3cret"
  );
  await testConnection(page);
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect.poll(() => createBody).toBeDefined();
  expect(createBody?.["spec"]).toMatchObject({
    config: { sslMode: "SSL_MODE_VERIFY_FULL" },
  });
});

test("new instance: editing connection fields after test requires retest before create", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);
  await mockTestConnection(page);

  await testConnection(page);
  await expect(
    page.getByRole("button", { name: "Create instance" })
  ).toBeEnabled();

  await page.getByLabel("Host").fill("db.internal");

  await expect(page.getByText("Connection successful.")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Create instance" })
  ).toBeDisabled();
});

test("new instance: empty list create flow returns to new instance after deleting an instance", {
  tag: ["@feat:instances", "@flow:create"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  await page.goto("/instances/production/configuration");
  await page.route("**/DeleteInstance", async (route) =>
    fulfillJson(route, {})
  );
  await page.route("**.DeleteInstance", async (route) =>
    fulfillJson(route, {})
  );
  await mockInstanceCatalog(page, []);

  await page.getByRole("button", { name: "Delete instance" }).first().click();
  await page
    .getByRole("alertdialog", { name: "Delete instance?" })
    .getByLabel("Type Production Postgres to confirm")
    .fill("Production Postgres");
  await page
    .getByRole("alertdialog", { name: "Delete instance?" })
    .getByRole("button", { name: "Delete instance" })
    .click();

  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
});

test("new instance: test connection sends standalone request and shows success", {
  tag: ["@feat:instances", "@flow:create"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);

  let connectionBody: Record<string, unknown> | undefined;
  await page.route("**/TestInstanceConnection", async (route) => {
    connectionBody = route.request().postDataJSON();
    await fulfillJson(route, {});
  });
  await page.route("**.TestInstanceConnection", async (route) => {
    connectionBody = route.request().postDataJSON();
    await fulfillJson(route, {});
  });

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect(page.getByText("Connection successful.")).toBeVisible();
  expect(connectionBody?.["config"]).toMatchObject({
    host: "db.local",
    password: "secret",
  });
});

test("new instance: test connection API error stays on form", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);
  await page.route("**/TestInstanceConnection", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "connection refused" },
      500
    );
  });
  await page.route("**.TestInstanceConnection", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "connection refused" },
      500
    );
  });

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect(page.getByText("connection refused")).toBeVisible();
  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
});

test("new instance: API error keeps user on form with retryable feedback", {
  tag: ["@feat:instances", "@flow:error"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);
  await mockTestConnection(page);
  await page.route("**/CreateInstance", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "duplicate instance" },
      500
    );
  });
  await page.route("**.CreateInstance", async (route) => {
    await fulfillJson(
      route,
      { code: "internal", message: "duplicate instance" },
      500
    );
  });

  await testConnection(page);
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect(page.getByText("duplicate instance")).toBeVisible();
  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
});

test("new instance: successful create opens first database explorer", {
  tag: ["@smoke", "@feat:instances", "@flow:navigate"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page, sampleDatabase);
  await mockTestConnection(page);
  await mockRpc(page, "SchemaService/ListSchemas", {
    nextPageToken: "",
    schemas: [
      {
        displayName: "public",
        isSystemSchema: false,
        name: "instances/production/databases/appdb/schemas/public",
        owner: "app_owner",
      },
    ],
  });
  await mockRpc(page, "ListTables", { nextPageToken: "", tables: [] });
  await mockRpc(page, "ListViews", { nextPageToken: "", views: [] });

  await page.route("**/CreateInstance", async (route) => {
    await fulfillJson(route, { instance: sampleInstance });
  });
  await page.route("**.CreateInstance", async (route) => {
    await fulfillJson(route, { instance: sampleInstance });
  });

  await testConnection(page);
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect(page).toHaveURL(PRODUCTION_APPDB_EXPLORER_URL_RE);
});

test("new instance: validates port range before sending request", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);

  await page.getByLabel("Port").fill("70000");
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect(
    page.getByText("Port must be between 1 and 65535.")
  ).toBeVisible();
});

test("new instance: advanced instance id and labels are sent on create", {
  tag: ["@feat:instances", "@flow:create"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, []);
  await mockTestConnection(page);

  let createBody: Record<string, unknown> | undefined;
  await page.route("**/CreateInstance", async (route) => {
    createBody = route.request().postDataJSON();
    await fulfillJson(route, { instance: sampleInstance });
  });
  await page.route("**.CreateInstance", async (route) => {
    createBody = route.request().postDataJSON();
    await fulfillJson(route, { instance: sampleInstance });
  });

  await page.getByRole("button", { name: "Show advanced options" }).click();
  await page.getByLabel("Instance ID (optional)").fill("production");
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByPlaceholder("Key").fill("env");
  await page.getByPlaceholder("Value").fill("prod");
  await testConnection(page);
  await page.getByRole("button", { name: "Create instance" }).click();

  expect(createBody?.["instanceId"]).toBe("production");
  expect(createBody?.["spec"]).toMatchObject({
    displayName: "Production Postgres",
    labels: { env: "prod" },
  });
});

test("new instance: advanced label requires a key before submit", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await gotoCreateInstance(page);
  await fillRequiredInstanceFields(page);

  await page.getByRole("button", { name: "Show advanced options" }).click();
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByPlaceholder("Value").fill("prod");
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect(page.getByText("Label keys cannot be empty.")).toBeVisible();
  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
});
