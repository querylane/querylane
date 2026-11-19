import { expect, test } from "./browser.test-utils";
import {
  mockDataExplorerApp,
  mockDefaultReadRows,
  mockExplorerShell,
  mockPaginatedReadRows,
  mockTableCatalog,
} from "./data-explorer.fixture";
import { mockRpc, waitForRpc } from "./msw-network.test-utils";

import {
  mockApiManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockOverviewSupportData,
  mockReadyOnboarding,
  sampleDatabase,
  sampleInstance,
} from "./querylane-rpc.fixture";

const EXPLORER_URL_RE = /\/instances\/production\/databases\/appdb\/explorer/u;
const BILLING_SCHEMA_URL_RE = /[?&]schema=billing\b/u;
const TABLE_CATEGORY_URL_RE = /[?&]category=tables\b/u;
const ORDERS_NAME_URL_RE = /[?&]name=orders\b/u;

const ORDERS_HEADING_RE = /public\.orders/u;
const SORT_WITH_ONE_COLUMN_RE = /Sort 1/u;

async function collectTabFocusSnapshots(
  page: Parameters<typeof mockDataExplorerApp>[0],
  steps: number
) {
  const snapshots: {
    isInObjectBrowser: boolean;
    label: string;
    role: string | null;
    tagName: string;
  }[] = [];

  async function collectNextSnapshot(remainingSteps: number) {
    if (remainingSteps <= 0) {
      return;
    }

    await page.keyboard.press("Tab");
    snapshots.push(
      await page.evaluate(() => {
        const { activeElement } = document;
        if (!(activeElement instanceof HTMLElement)) {
          return {
            isInObjectBrowser: false,
            label: "",
            role: null,
            tagName: "",
          };
        }

        return {
          isInObjectBrowser: Boolean(
            activeElement.closest('aside[aria-label="Database objects"]')
          ),
          label:
            activeElement.getAttribute("aria-label") ??
            activeElement.getAttribute("placeholder") ??
            activeElement.textContent?.replaceAll(/\s+/gu, " ").trim() ??
            "",
          role: activeElement.getAttribute("role"),
          tagName: activeElement.tagName.toLowerCase(),
        };
      })
    );
    await collectNextSnapshot(remainingSteps - 1);
  }

  await collectNextSnapshot(steps);

  return snapshots;
}

async function gotoExplorer(
  page: Parameters<typeof mockDataExplorerApp>[0],
  search = ""
) {
  await mockDataExplorerApp(page);
  await page.goto(`/instances/production/databases/appdb/explorer${search}`);
  await expect(page).toHaveURL(EXPLORER_URL_RE);
}

test.beforeEach(async ({ page }) => {
  await mockOverviewSupportData(page);
});

test("data explorer: Lighthouse route covers manual accessibility contracts", {
  tag: ["@feat:data-explorer", "@a11y"],
}, async ({ checkAccessibility, page }) => {
  await gotoExplorer(page, "?schema=public&category=tables&name=orders");

  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();

  await checkAccessibility();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Database objects" })
  ).toBeVisible();
  await expect(page.getByRole("tablist").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Data" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByPlaceholder("Filter…")).toBeVisible();
  const refreshRowsButton = page.getByRole("button", { name: "Refresh rows" });
  await expect(refreshRowsButton).toBeVisible();
  await refreshRowsButton.focus();
  await expect(refreshRowsButton).toBeFocused();

  const filterInput = page.getByPlaceholder("Filter…");
  await filterInput.focus();
  await expect(filterInput).toBeFocused();

  const tabFocusSnapshots = await collectTabFocusSnapshots(page, 30);
  const meaningfulFocusTargets = tabFocusSnapshots.filter(
    (snapshot) =>
      snapshot.label.length > 0 ||
      snapshot.role !== null ||
      snapshot.tagName === "input"
  );

  expect(meaningfulFocusTargets.length).toBeGreaterThanOrEqual(6);
  expect(tabFocusSnapshots.some((snapshot) => snapshot.isInObjectBrowser)).toBe(
    true
  );
  expect(
    tabFocusSnapshots.some((snapshot) => !snapshot.isInObjectBrowser)
  ).toBe(true);
  expect(
    tabFocusSnapshots.some((snapshot) => snapshot.label.includes("Filter"))
  ).toBe(true);
});

test("data explorer: sorting and pagination update ReadRows inputs", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockPaginatedReadRows(page);

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );
  await expect(page.getByText("ada@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Sort" }).click();
  await page.getByText("Add sort column").click();
  const sorted = waitForRpc(page, "ReadRows");
  await page.getByRole("option", { name: "email" }).click();
  await expect(
    page.getByRole("button", { name: SORT_WITH_ONE_COLUMN_RE })
  ).toBeVisible();
  expect(await sorted).toMatchObject({
    orderBy: [{ column: "email", direction: "DIRECTION_ASC" }],
  });

  const next = waitForRpc(page, "ReadRows");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("grace@example.com")).toBeVisible();
  expect(await next).toMatchObject({ pageToken: "page-2" });
});

test("data explorer: switching schema clears stale table search state", {
  tag: ["@feat:data-explorer", "@flow:navigate"],
}, async ({ page }) => {
  await gotoExplorer(page, "?schema=public&category=tables&name=orders");

  await page
    .getByRole("complementary", { name: "Database objects" })
    .getByRole("button", { exact: true, name: "billing" })
    .click();

  await expect(page).toHaveURL(BILLING_SCHEMA_URL_RE);
  await expect(page).not.toHaveURL(TABLE_CATEGORY_URL_RE);
  await expect(page).not.toHaveURL(ORDERS_NAME_URL_RE);
  await expect(page.getByRole("heading", { name: "billing" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "invoices" })).toBeVisible();
});

test("data explorer: row drawer fetches a truncated cell full value", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockDefaultReadRows(page);
  await mockRpc(page, "ReadCellValue", {
    value: { value: { jsonValue: '{"preview":false,"full":true}' } },
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );
  await page.getByRole("button", { name: "Expand row" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("public.orders");
  await page
    .getByRole("button", { name: "Load full value for payload" })
    .click();

  await expect(page.getByRole("dialog")).toContainText('"full": true');
});

test("data explorer: stale catalog notices persist across schema navigation", {
  tag: ["@feat:data-explorer", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page, sampleDatabase);
  await mockRpc(page, "SchemaService/ListSchemas", {
    nextPageToken: "",
    schemas: [
      {
        displayName: "public",
        isSystemSchema: false,
        name: "instances/production/databases/appdb/schemas/public",
        owner: "app_owner",
      },
      {
        displayName: "billing",
        isSystemSchema: false,
        name: "instances/production/databases/appdb/schemas/billing",
        owner: "billing_owner",
      },
    ],
    syncMetadata: { isStale: true, syncStatus: "CATALOG_SYNC_STATUS_SYNCING" },
  });
  await mockRpc(page, "ListSchemas", {
    nextPageToken: "",
    schemas: [
      {
        displayName: "public",
        isSystemSchema: false,
        name: "instances/production/databases/appdb/schemas/public",
        owner: "app_owner",
      },
      {
        displayName: "billing",
        isSystemSchema: false,
        name: "instances/production/databases/appdb/schemas/billing",
        owner: "billing_owner",
      },
    ],
    syncMetadata: { isStale: true, syncStatus: "CATALOG_SYNC_STATUS_SYNCING" },
  });
  await mockRpc(page, "SchemaService/GetSchema", {
    schema: {
      displayName: "public",
      isSystemSchema: false,
      name: "instances/production/databases/appdb/schemas/public",
      owner: "app_owner",
    },
  });
  await mockRpc(page, "ListViews", { nextPageToken: "", views: [] });
  await mockRpc(page, "ListTables", {
    nextPageToken: "",
    syncMetadata: {
      syncError: "upstream unavailable",
      syncStatus: "CATALOG_SYNC_STATUS_ERROR",
    },
    tables: [],
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public"
  );
  await expect(
    page.getByText("Refreshing catalog. Showing cached results.").first()
  ).toBeVisible();
  await page
    .getByRole("complementary", { name: "Database objects" })
    .getByRole("button", { exact: true, name: "billing" })
    .click();

  await expect(page).toHaveURL(BILLING_SCHEMA_URL_RE);
  await expect(
    page.getByText("Refreshing catalog. Showing cached results.").first()
  ).toBeVisible();
});
