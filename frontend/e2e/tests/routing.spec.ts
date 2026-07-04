import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";
import {
  mockApiManagedReadyConsole,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyEmptyApp,
  mockReadyOnboarding,
  mockRpcError,
  sampleInstance,
} from "./helpers";

const NEW_INSTANCE_URL_RE = /\/new-instance$/;
const PRODUCTION_INSTANCE_URL_RE = /\/instances\/production\/?$/;
const REPORTING_INSTANCE_URL_RE = /\/instances\/reporting\/?$/;
const APPDB_DATABASE_URL_RE = /\/instances\/production\/databases\/appdb\/?$/;
const APPDB_EXPLORER_URL_RE =
  /\/instances\/production\/databases\/appdb\/explorer/;
const CATEGORY_SEARCH_RE = /[?&]category=/;
const NAME_SEARCH_RE = /[?&]name=/;
const ORDERS_NAME_SEARCH_RE = /[?&]name=orders\b/;
const PUBLIC_ORDERS_HEADING_RE = /public\.orders/;
const PUBLIC_SCHEMA_SEARCH_RE = /[?&]schema=public\b/;
const STALE_DATABASE_CONTEXT_URL_RE = /databases\/appdb|explorer/;
const TABLES_CATEGORY_SEARCH_RE = /[?&]category=tables\b/;

const reportingInstance = {
  ...sampleInstance,
  config: {
    ...sampleInstance.config,
    host: "reporting.db.local",
  },
  displayName: "Reporting Postgres",
  labels: { env: "reporting" },
  name: "instances/reporting",
};

test("home: instanceId search opens the requested instance instead of the first one", {
  tag: ["@smoke", "@feat:routing", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance, reportingInstance]);
  await mockInstanceDetails(page, reportingInstance);
  await mockDatabases(page, []);

  await page.goto("/?instanceId=reporting");

  await expect(page).toHaveURL(REPORTING_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Reporting Postgres" })
  ).toBeVisible();
  await expect(page.getByText("reporting.db.local:5432")).toBeVisible();
});

test("home: unknown instanceId falls back to the first available instance", {
  tag: ["@feat:routing", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance, reportingInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, []);

  await page.goto("/?instanceId=missing");

  await expect(page).toHaveURL(PRODUCTION_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
});

test("home: instance catalog failure shows a release-blocking error screen", {
  tag: ["@feat:routing", "@flow:error"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockRpcError(page, "InstanceService/ListInstances", "catalog offline");

  await page.goto("/");

  await expect(page.getByText("catalog offline")).toBeVisible();
  await expect(page.getByText("Endpoint:")).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
});

test("routing: unknown ready route renders not found and can recover home", {
  tag: ["@feat:routing", "@flow:error"],
}, async ({ page }) => {
  await mockReadyEmptyApp(page);

  await page.goto("/does-not-exist");

  await expect(
    page.getByRole("heading", { name: "Page not found" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to home" }).click();

  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
});

test("routing: access denied fallback has retry and home recovery", {
  tag: ["@feat:routing", "@flow:error"],
}, async ({ page }) => {
  await mockReadyEmptyApp(page);

  await page.goto("/access-denied");

  await expect(page.getByText("Access denied").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Go home" }).click();

  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
});

test("routing: browser back and forward restore instance database and explorer", {
  tag: ["@feat:routing", "@flow:navigate"],
}, async ({ page }) => {
  await mockDataExplorerApp(page);

  await page.goto("/instances/production");
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();

  await page.goto("/instances/production/databases/appdb");
  await expect(page.getByRole("heading", { name: "appdb" })).toBeVisible();

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );
  await expect(
    page.getByRole("heading", { name: PUBLIC_ORDERS_HEADING_RE })
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(APPDB_DATABASE_URL_RE);
  await expect(page.getByRole("heading", { name: "appdb" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(PRODUCTION_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(APPDB_DATABASE_URL_RE);
  await page.goForward();
  await expect(page).toHaveURL(APPDB_EXPLORER_URL_RE);
  await expect(
    page.getByRole("heading", { name: PUBLIC_ORDERS_HEADING_RE })
  ).toBeVisible();
});

test("routing: changing selected instance clears stale database and explorer context", {
  tag: ["@feat:routing", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance, reportingInstance]);
  await mockInstanceDetails(page, reportingInstance);
  await mockDatabases(page, []);

  await page.goto("/?instanceId=reporting");

  await expect(page).toHaveURL(REPORTING_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Reporting Postgres" })
  ).toBeVisible();
  await expect(page).not.toHaveURL(STALE_DATABASE_CONTEXT_URL_RE);
});

test("routing: malformed explorer URL params normalize safely", {
  tag: ["@feat:routing", "@flow:error"],
}, async ({ page }) => {
  await mockDataExplorerApp(page);

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=wat&name=orders"
  );

  await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
  await expect(page).not.toHaveURL(CATEGORY_SEARCH_RE);
  await expect(page).not.toHaveURL(NAME_SEARCH_RE);
});

test("routing: refresh on nested explorer route preserves selected resource", {
  tag: ["@feat:routing", "@flow:navigate"],
}, async ({ page }) => {
  await mockDataExplorerApp(page);

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );
  await expect(
    page.getByRole("heading", { name: PUBLIC_ORDERS_HEADING_RE })
  ).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(APPDB_EXPLORER_URL_RE);
  await expect(page).toHaveURL(PUBLIC_SCHEMA_SEARCH_RE);
  await expect(page).toHaveURL(TABLES_CATEGORY_SEARCH_RE);
  await expect(page).toHaveURL(ORDERS_NAME_SEARCH_RE);
  await expect(
    page.getByRole("heading", { name: PUBLIC_ORDERS_HEADING_RE })
  ).toBeVisible();
});
