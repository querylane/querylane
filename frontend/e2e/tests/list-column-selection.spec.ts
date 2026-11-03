import { toJson } from "@bufbuild/protobuf";
import type { Page } from "playwright/test";
import {
  ExecuteQueryResponseSchema,
  SQLService,
} from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import {
  busyActivity,
  designExtensions,
  queryInsights,
} from "../../src/test/fixtures/console-resource-fixtures";
import {
  changeLogPartitionsSchema,
  customersSchema,
  MATERIALIZED_VIEW_SCHEMA,
} from "../../src/test/fixtures/data-explorer-surface-fixtures";
import {
  accessMapFixture,
  ROLES_TABLE_ROLES,
  roleDetailFixture,
} from "../../src/test/fixtures/role-fixtures";
import { workbenchQueryResponses } from "../../src/test/fixtures/sql-workbench-fixtures";
import {
  ACTIVITY_URL,
  DATABASE_URL,
  EXTENSIONS_URL,
  INSTANCE_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import {
  explorerUrl,
  mockExplorerSurfaces,
  tableUrl,
} from "../visual/data-explorer-surface-fixtures";
import {
  DATA_GRID_TABLE_URL,
  mockDataGridExplorer,
} from "../visual/data-grid-fixtures";
import { mockRolesScreen } from "../visual/role-fixtures";
import { connectStreamBody } from "../visual/serve-service";
import { expect, test } from "./base";
import { mockRpc } from "./helpers";

const RUN_BUTTON = /^Run/u;

interface ColumnJourney {
  afterReload?: () => Promise<void>;
  checkbox?: "checkbox" | "menuitemcheckbox";
  index?: number;
  key: string;
  openView?: () => Promise<void>;
  role?: "table" | "grid";
  skipNavigation?: boolean;
  url: string;
}

async function bookmarkColumns(
  page: Page,
  {
    key,
    url,
    index = 0,
    role = "table",
    checkbox = "menuitemcheckbox",
    afterReload,
    skipNavigation = false,
    openView,
  }: ColumnJourney
) {
  if (!skipNavigation) {
    await page.goto(url);
  }
  await openView?.();
  const table = page.getByRole(role).nth(index);
  const headers = table.getByRole("columnheader");
  await expect(headers.first()).toBeVisible();
  const count = await headers.count();
  expect(count).toBeGreaterThan(1);
  const original = new URL(page.url());
  const control = page
    .getByRole("button", { name: "Columns", exact: true })
    .nth(index);
  await control.click();
  const options =
    checkbox === "checkbox"
      ? page.locator('[aria-label="Manage columns"]').getByRole(checkbox)
      : page.getByRole(checkbox);
  const option = options
    .and(page.locator(':not([aria-disabled="true"]):not(:disabled)'))
    .first();
  await expect(option).toBeEnabled();
  await option.click();
  await page.keyboard.press("Escape");
  await expect(headers).toHaveCount(count - 1);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("columns") ?? "")
    .toContain(key);
  expect(new URL(page.url()).pathname).toBe(original.pathname);
  for (const [name, value] of original.searchParams) {
    expect(new URL(page.url()).searchParams.get(name)).toBe(value);
  }
  await page.reload();
  await openView?.();
  await afterReload?.();
  await expect(headers).toHaveCount(count - 1);
  await control.click();
  const resetRole = checkbox === "checkbox" ? "button" : "menuitem";
  await page
    .getByRole(resetRole, { name: "Reset columns", exact: true })
    .click();
  if (checkbox === "checkbox") {
    await page.keyboard.press("Escape");
  }
  await expect(headers).toHaveCount(count);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("columns") ?? "")
    .not.toContain(key);
  return table;
}

for (const entry of [
  { key: "instance-applications", url: INSTANCE_URL },
  { key: "instance-databases", url: INSTANCE_URL, index: 1 },
  { key: "instance-activity-sessions", url: ACTIVITY_URL },
  { key: "database-top-queries", url: DATABASE_URL },
  { key: "database-extensions", url: EXTENSIONS_URL },
]) {
  test(`bookmarked columns: ${entry.key}`, async ({ page }) => {
    await mockConsoleResources(page, {
      activity: busyActivity,
      queryInsights: queryInsights(),
      extensions: designExtensions,
    });
    const openView =
      entry.key === "database-top-queries"
        ? async () => {
            await page
              .getByRole("button", { name: "Insights", exact: true })
              .click();
          }
        : undefined;
    const table = await bookmarkColumns(page, {
      ...entry,
      ...(openView ? { openView } : {}),
    });
    await expect(table).toBeVisible();
  });
}

for (const tab of ["columns", "keys", "indexes", "constraints"]) {
  test(`bookmarked columns: table ${tab}`, async ({ page }) => {
    await mockExplorerSurfaces(page, { schemas: [customersSchema()] });
    const table = await bookmarkColumns(page, {
      key: `data-explorer-table-${tab}`,
      url: tableUrl("public", "customers", tab),
    });
    await expect(table).toBeVisible();
  });
}

test("bookmarked columns: partitions", async ({ page }) => {
  const schema = changeLogPartitionsSchema();
  await mockExplorerSurfaces(page, { schemas: [schema] });
  const table = await bookmarkColumns(page, {
    key: "table-partitions",
    url: tableUrl(schema.name, "change_log", "partitions"),
  });
  await expect(table).toBeVisible();
});
test("bookmarked columns: schema objects", async ({ page }) => {
  await mockExplorerSurfaces(page, { schemas: [customersSchema()] });
  const table = await bookmarkColumns(page, {
    key: "schema-objects",
    url: explorerUrl({ schema: "public" }),
  });
  await expect(table).toBeVisible();
});

test("bookmarked columns: roles", async ({ page }) => {
  await mockRolesScreen(page, accessMapFixture({ roles: ROLES_TABLE_ROLES }));
  const table = await bookmarkColumns(page, {
    key: "instance-roles",
    url: "/instances/production/roles",
  });
  await expect(table).toBeVisible();
});

for (const reach of ["direct", "owns"]) {
  test(`bookmarked columns: role ${reach}`, async ({ page }) => {
    await mockRolesScreen(page, roleDetailFixture());
    const suffix =
      reach === "owns"
        ? "&grantsReach=owns"
        : "&grantsSchema=public&grantsType=tables";
    const table = await bookmarkColumns(page, {
      key: reach === "owns" ? "role-owned-objects" : "role-grants-objects",
      url: `/instances/production/roles/app_user?tab=grants${suffix}`,
    });
    await expect(table).toBeVisible();
  });
}

for (const [index, key] of [
  "admin-replicas",
  "admin-job-queue",
  "admin-catalog-sync",
  "admin-storage",
].entries()) {
  test(`bookmarked columns: ${key}`, async ({ page }) => {
    await mockConsoleResources(page);
    await mockRpc(page, "AdminService/ListReplicas", { replicas: [] });
    await mockRpc(page, "AdminService/ListAdminRunnerExecutions", {
      executions: [],
    });
    await mockRpc(page, "AdminService/ListCatalogSyncStates", {
      catalogSyncStates: [],
    });
    await mockRpc(page, "AdminService/GetMetricsStorageStats", {
      sampleTables: [],
    });
    const table = await bookmarkColumns(page, { key, url: "/admin", index });
    await expect(table).toBeVisible();
  });
}

test("bookmarked columns: table data", async ({ page }) => {
  await mockDataGridExplorer(page);
  const table = await bookmarkColumns(page, {
    key: "table-data:",
    url: DATA_GRID_TABLE_URL,
    role: "grid",
    checkbox: "checkbox",
  });
  await expect(table).toBeVisible();
});

test("bookmarked columns: materialized view data", async ({ page }) => {
  await mockExplorerSurfaces(page, { schemas: [MATERIALIZED_VIEW_SCHEMA] });
  const table = await bookmarkColumns(page, {
    key: "table-data:",
    url: explorerUrl({
      category: "views",
      name: "customer_success_daily_rollups",
      schema: "public",
    }),
    role: "grid",
    checkbox: "checkbox",
  });
  await expect(table).toBeVisible();
});

for (const route of ["sql", "workbench"]) {
  test(`bookmarked columns: ${route} results do not execute on selection or reload`, async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await mockRpc(page, "SQLService/ValidateQuery", {});
    let executions = 0;
    await page.route(
      `**/${SQLService.typeName}/${SQLService.method.executeQuery.name}`,
      async (rpc) => {
        executions += 1;
        await rpc.fulfill({
          body: connectStreamBody(
            workbenchQueryResponses().map((message) =>
              toJson(ExecuteQueryResponseSchema, message)
            )
          ),
          contentType: "application/connect+json",
        });
      }
    );
    const url = `${DATABASE_URL}/${route}`;
    await page.goto(url);
    await page
      .getByRole("textbox", { name: "SQL editor" })
      .fill("SELECT ref, carrier, eta FROM shipping.shipments;");
    await page.getByRole("button", { name: RUN_BUTTON }).click();
    await expect(
      page.getByText("ML-2026-048292", { exact: true })
    ).toBeVisible();
    // Reload restores the saved draft, never its previous execution or results.
    const run = async () => {
      await expect(
        page.getByRole("button", { name: RUN_BUTTON })
      ).toBeEnabled();
      await page.getByRole("button", { name: RUN_BUTTON }).click();
      await expect(
        page.getByText("Pacific Crest Shipping", { exact: true }).first()
      ).toBeVisible();
    };
    // Keep the existing result for the first action, rather than executing from a URL.
    await bookmarkColumns(page, {
      key: "sql-results",
      url: page.url(),
      role: "grid",
      afterReload: run,
      skipNavigation: true,
    });
    expect(executions).toBe(2);
  });
}

test("extension description follows explicit selection on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockConsoleResources(page, { extensions: designExtensions });
  await page.goto(EXTENSIONS_URL);
  await expect(
    page.getByRole("columnheader", { name: "Description", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Description", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("columnheader", { name: "Description", exact: true })
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Description", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("columnheader", { name: "Description", exact: true })
  ).toBeVisible();
});
