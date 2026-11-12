import { fromJsonString, toJson } from "@bufbuild/protobuf";
import type { Page } from "playwright/test";
import {
  ExecuteQueryResponseSchema,
  SQLService,
} from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import {
  type ReadRowsRequest,
  ReadRowsRequestSchema,
  RowOrder_Direction,
  TableDataService,
} from "../../src/protogen/querylane/console/v1alpha1/table_data_pb";
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
const RESULT_EXPORT_CONTROL = /^Export$/u;
const AVAILABLE_EXTENSIONS_TAB = /^Available/u;
const USERS_FILTER = /^Users(?: |$)/u;
const GRID_COLUMN_OPTIONS = /^Open options for column/u;
const SORTABLE_HEADER = /, (?:not sorted|sorted ascending|sorted descending)$/u;
const MOVE_COLUMN_FORWARD = /^Move .* (?:right|down)$/u;

interface ColumnJourney {
  afterReload?: () => Promise<void>;
  checkbox?: "checkbox" | "menuitemcheckbox";
  filterLabel?: string | RegExp;
  filterRole?: "button" | "textbox";
  index?: number;
  key: string;
  openView?: () => Promise<void>;
  role?: "table" | "grid";
  skipNavigation?: boolean;
  url: string;
}

async function expectColumnPickerInline(
  page: Page,
  index: number,
  {
    label: filterLabel,
    role: filterRole = "textbox",
  }: {
    label: string | RegExp;
    role?: "button" | "textbox" | undefined;
  }
) {
  const control = page
    .getByRole("button", { name: "Columns", exact: true })
    .nth(index);
  await control.scrollIntoViewIfNeeded();
  const search = page.getByRole(filterRole, {
    name: filterLabel,
    exact: true,
  });
  await expect
    .poll(
      async () => {
        const searchTop = await search.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.top + box.height / 2;
        });
        const controlTop = await control.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.top + box.height / 2;
        });
        return Math.abs(searchTop - controlTop);
      },
      { message: "Column picker shares the filter row" }
    )
    .toBeLessThanOrEqual(1);
}

async function bookmarkColumns(
  page: Page,
  {
    key,
    filterLabel,
    filterRole,
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
  const defaultHeaders = await headers.allTextContents();
  if (role === "grid") {
    await table
      .getByRole("button", { name: GRID_COLUMN_OPTIONS })
      .first()
      .click();
    await page
      .getByRole("menuitemcheckbox", { name: "Sort descending", exact: true })
      .click();
  } else {
    await table
      .getByRole("button", {
        name: SORTABLE_HEADER,
      })
      .first()
      .click();
  }
  await expect
    .poll(() => new URL(page.url()).searchParams.get("listSort") ?? "")
    .toContain(key);
  const control = page
    .getByRole("button", { name: "Columns", exact: true })
    .nth(index);
  if (filterLabel !== undefined) {
    await expectColumnPickerInline(page, index, {
      label: filterLabel,
      role: filterRole,
    });
  }
  await control.click();
  if (checkbox === "checkbox") {
    await page
      .getByRole("dialog", { name: "Manage columns" })
      .getByRole("button", { name: MOVE_COLUMN_FORWARD })
      .first()
      .click();
  }
  await expect
    .poll(() =>
      (new URL(page.url()).searchParams.get("columnOrder") ?? "").includes(key)
    )
    .toBe(checkbox === "checkbox");
  await expect
    .poll(
      async () =>
        JSON.stringify(await headers.allTextContents()) !==
        JSON.stringify(defaultHeaders)
    )
    .toBe(checkbox === "checkbox");
  const options =
    checkbox === "checkbox"
      ? page
          .getByRole("dialog", { name: "Manage columns" })
          .getByRole("checkbox")
      : page.getByRole("menu").getByRole("menuitemcheckbox");
  const option = options
    .and(page.locator(':not([aria-disabled="true"]):not(:disabled)'))
    .first();
  await expect(option).toBeEnabled();
  await option.click();
  await page.keyboard.press("Escape");
  await expect(headers).toHaveCount(count - 1);
  const chosenHeaders = await headers.allTextContents();
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
  await expect.poll(() => headers.allTextContents()).toEqual(chosenHeaders);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("listSort") ?? "")
    .toContain(key);
  await control.click();
  await page
    .getByRole(checkbox === "checkbox" ? "button" : "menuitem", {
      name: "Reset columns",
      exact: true,
    })
    .click();
  if (checkbox === "checkbox") {
    await page.keyboard.press("Escape");
  }
  await expect
    .poll(() => new URL(page.url()).searchParams.get("columnOrder") ?? "")
    .not.toContain(key);
  await expect(headers).toHaveCount(count);
  await expect.poll(() => headers.allTextContents()).toEqual(defaultHeaders);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("columns") ?? "")
    .not.toContain(key);
  return table;
}

for (const entry of [
  { key: "instance-applications", url: INSTANCE_URL },
  {
    key: "instance-databases",
    url: INSTANCE_URL,
    index: 1,
    filterLabel: "Search databases…",
  },
  {
    key: "instance-activity-sessions",
    url: ACTIVITY_URL,
    filterLabel: "Search query, user, app…",
  },
  {
    key: "database-top-queries",
    url: DATABASE_URL,
    filterLabel: "Search queries…",
  },
  {
    key: "database-extensions",
    url: EXTENSIONS_URL,
    filterLabel: "Search extensions…",
  },
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
      filterLabel: `Search ${tab}…`,
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
    filterLabel: "Search partitions…",
    url: tableUrl(schema.name, "change_log", "partitions"),
  });
  await expect(table).toBeVisible();
});
test("bookmarked columns: schema objects", async ({ page }) => {
  await mockExplorerSurfaces(page, { schemas: [customersSchema()] });
  const table = await bookmarkColumns(page, {
    key: "schema-objects",
    filterLabel: "Search objects…",
    url: explorerUrl({ schema: "public" }),
  });
  await expect(table).toBeVisible();
});

test("bookmarked columns: roles", async ({ page }) => {
  await mockRolesScreen(page, accessMapFixture({ roles: ROLES_TABLE_ROLES }));
  const table = await bookmarkColumns(page, {
    key: "instance-roles",
    filterLabel: "Search roles…",
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
      filterLabel:
        reach === "owns" ? "Search owned objects…" : "Search objects…",
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
  const requests: ReadRowsRequest[] = [];
  await page.route(
    `**/${TableDataService.typeName}/${TableDataService.method.readRows.name}`,
    async (rpc) => {
      requests.push(
        fromJsonString(ReadRowsRequestSchema, rpc.request().postData() ?? "{}")
      );
      await rpc.fallback();
    }
  );
  const table = await bookmarkColumns(page, {
    key: "table-data:",
    url: DATA_GRID_TABLE_URL,
    role: "grid",
    checkbox: "checkbox",
  });
  await expect(table).toBeVisible();
  expect(
    requests.some((request) =>
      request.orderBy.some(
        (order) => order.direction === RowOrder_Direction.DESC
      )
    )
  ).toBe(true);
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
        page.getByRole("grid").getByRole("row").nth(1)
      ).toBeVisible();
    };
    // Keep the existing result for the first action, rather than executing from a URL.
    await bookmarkColumns(page, {
      key: "sql-results",
      filterLabel: RESULT_EXPORT_CONTROL,
      filterRole: "button",
      url: page.url(),
      role: "grid",
      afterReload: run,
      skipNavigation: true,
    });
    expect(executions).toBe(2);
  });
}

for (const width of [390, 320]) {
  test(`extension description follows selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockConsoleResources(page, { extensions: designExtensions });
    await page.goto(EXTENSIONS_URL);
    await expectColumnPickerInline(page, 0, { label: "Search extensions…" });
    await expect(
      page.getByRole("tab", { name: AVAILABLE_EXTENSIONS_TAB })
    ).toBeInViewport({ ratio: 1 });
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
}

test("role filters retain bookmarked sorting and column order", async ({
  page,
}) => {
  await mockRolesScreen(page, accessMapFixture({ roles: ROLES_TABLE_ROLES }));
  const order = JSON.stringify({
    "instance-roles": ["connLimit", "roleName", "login"],
  });
  const sorting = JSON.stringify({
    "instance-roles": [{ id: "roleName", desc: true }],
  });
  await page.goto(
    `/instances/production/roles?columnOrder=${encodeURIComponent(order)}&listSort=${encodeURIComponent(sorting)}`
  );
  await page.getByRole("combobox", { name: "Type", exact: true }).click();
  await page.getByRole("option", { name: USERS_FILTER }).click();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("type"))
    .toBe("login");
  expect(new URL(page.url()).searchParams.get("columnOrder")).toBe(order);
  expect(new URL(page.url()).searchParams.get("listSort")).toBe(sorting);
  await expect(
    page.getByRole("table").getByRole("columnheader").first()
  ).toContainText("Conn limit");
  await page.setViewportSize({ width: 320, height: 900 });
  await expectColumnPickerInline(page, 0, { label: "Search roles…" });
  await expect(
    page.getByRole("button", { name: "Columns", exact: true })
  ).toBeInViewport({ ratio: 1 });
});

for (const width of [480, 320]) {
  test(`column picker stays inline at ${width}px and in RTL`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockConsoleResources(page);
    await page.goto(INSTANCE_URL);
    await expectColumnPickerInline(page, 1, { label: "Search databases…" });
    await expect(
      page.getByRole("textbox", { name: "Search databases…", exact: true })
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Columns", exact: true }).nth(1)
    ).toBeInViewport({ ratio: 1 });
    await page.locator("html").evaluate((element) => {
      element.setAttribute("dir", "rtl");
    });
    await expectColumnPickerInline(page, 1, { label: "Search databases…" });
    await page
      .getByRole("button", { name: "Columns", exact: true })
      .nth(1)
      .click();
    await page
      .getByRole("menuitemcheckbox", { name: "Owner", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("table").nth(1).getByRole("columnheader")
    ).toHaveCount(3);
  });
}
