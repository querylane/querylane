import { expect, test } from "./base";
import {
  mockApiManagedReadyConsole,
  mockConfigManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyAppWithInstance,
  mockReadyOnboarding,
  sampleDatabase,
  sampleInstance,
} from "./helpers";

const NEW_INSTANCE_URL_RE = /\/new-instance$/;
const CONFIG_MANAGED_EMPTY_RE =
  /Instances are managed via the server configuration file/i;
const PRODUCTION_INSTANCE_URL_RE = /\/instances\/production\/?$/;
const AUDIT_DATABASE_URL_RE = /\/instances\/production\/databases\/audit\/?$/;

test("home: ready API-managed empty catalog redirects to new instance", {
  tag: ["@feat:instances", "@flow:create"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, []);

  await page.goto("/");

  await expect(page).toHaveURL(NEW_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
});

test("home: config-managed empty catalog shows managed empty state", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockConfigManagedReadyConsole(page);
  await mockInstanceCatalog(page, []);

  await page.goto("/");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(page.getByText(CONFIG_MANAGED_EMPTY_RE)).toBeVisible();
});

test("home: ready catalog redirects to first instance overview", {
  tag: ["@smoke", "@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);

  await page.goto("/");

  await expect(page).toHaveURL(PRODUCTION_INSTANCE_URL_RE);
  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
  await expect(page.getByText("db.local:5432")).toBeVisible();
  await expect(page.getByText("Primary")).toBeVisible();
});

test("instance overview: database table renders backend catalog rows", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [
    {
      characterSet: "UTF8",
      collation: "en_US.UTF-8",
      displayName: "analytics",
      isSystemDatabase: false,
      name: "instances/production/databases/analytics",
      owner: "analytics_owner",
    },
  ]);

  await page.goto("/instances/production");

  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { exact: true, name: "analytics" })
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "analytics_owner" })
  ).toBeVisible();
});

test("instance overview: filters databases and opens selected database", {
  tag: ["@feat:instances", "@flow:query"],
}, async ({ page }) => {
  const auditDatabase = {
    ...sampleDatabase,
    displayName: "audit",
    name: "instances/production/databases/audit",
    owner: "audit_owner",
  };
  const analyticsDatabase = {
    ...sampleDatabase,
    displayName: "analytics",
    name: "instances/production/databases/analytics",
    owner: "analytics_owner",
  };
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [analyticsDatabase, auditDatabase]);
  await mockDatabaseDetails(page, auditDatabase);

  await page.goto("/instances/production");
  await page.getByPlaceholder("Filter databases...").fill("audit");

  await expect(
    page.getByRole("cell", { exact: true, name: "audit" })
  ).toBeVisible();
  await expect(page.getByText("analytics_owner")).toBeHidden();

  await page.getByRole("cell", { exact: true, name: "audit" }).click();

  await expect(page).toHaveURL(AUDIT_DATABASE_URL_RE);
  await expect(page.getByRole("heading", { name: "audit" })).toBeVisible();
});
