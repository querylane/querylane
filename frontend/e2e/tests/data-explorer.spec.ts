import { expect, test } from "./base";
import {
  mockDataExplorerApp,
  mockDefaultReadRows,
  mockExplorerShell,
  mockPaginatedReadRows,
  mockReadRowsWithObserver,
  mockTableCatalog,
  ORDERS_TABLE_NAME,
  orderColumns,
} from "./data-explorer-fixtures";
import {
  mockApiManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  mockRpc,
  mockRpcError,
  sampleDatabase,
  sampleInstance,
} from "./helpers";

declare global {
  interface Window {
    querylaneE2eClipboard?: string;
  }
}

const EXPLORER_URL_RE = /\/instances\/production\/databases\/appdb\/explorer/;
const BILLING_SCHEMA_URL_RE = /[?&]schema=billing\b/;
const TABLE_CATEGORY_URL_RE = /[?&]category=tables\b/;
const ORDERS_NAME_URL_RE = /[?&]name=orders\b/;
const ACTIVE_ACCOUNTS_BUTTON_RE = /^active_accounts$/;
const ORDERS_BUTTON_RE = /^orders 4 KB$/;
const VIEW_CATEGORY_URL_RE = /[?&]category=views\b/;
const ACTIVE_ACCOUNTS_NAME_URL_RE = /[?&]name=active_accounts\b/;
const ORDERS_HEADING_RE = /public\.orders/;
const SORT_WITH_ONE_COLUMN_RE = /Sort 1/;
const TIER_ENTERPRISE_JSON_RE = /"tier":"enterprise"/;
const COPY_BUTTON_RE = /Copy/;
const DB_OVERVIEW_URL_RE =
  /\/instances\/production\/databases\/appdb(?:[?#]|$)/;
// The shared sidebar renders as an 18rem sheet on phone viewports.
const OBJECT_BROWSER_PHONE_MIN_WIDTH = 280;
const OBJECT_BROWSER_PHONE_MAX_WIDTH = 296;

const RICH_COLUMNS = [
  {
    columnName: "id",
    dataType: "DATA_TYPE_INTEGER",
    isNullable: false,
    rawType: "integer",
  },
  {
    columnName: "note",
    dataType: "DATA_TYPE_STRING",
    isNullable: true,
    rawType: "text",
  },
  {
    columnName: "active",
    dataType: "DATA_TYPE_BOOLEAN",
    isNullable: false,
    rawType: "boolean",
  },
  {
    columnName: "profile",
    dataType: "DATA_TYPE_JSON",
    isNullable: true,
    mayTruncate: true,
    rawType: "jsonb",
  },
  {
    columnName: "long_text",
    dataType: "DATA_TYPE_STRING",
    isNullable: true,
    mayTruncate: true,
    rawType: "text",
  },
];

async function collectTabFocusSnapshots(
  page: Parameters<typeof mockDataExplorerApp>[0],
  steps: number
) {
  const snapshots: Array<{
    isInObjectBrowser: boolean;
    label: string;
    role: string | null;
    tagName: string;
  }> = [];

  async function collectNextSnapshot(remainingSteps: number): Promise<void> {
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
            activeElement.textContent?.replace(/\s+/g, " ").trim() ??
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

test("data explorer: schema overview shows top tables and switches schema", {
  tag: ["@smoke", "@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await gotoExplorer(page);

  // Protects the default landing state: users must see the active schema and
  // its highest-value tables without needing live backend infrastructure.
  await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
  await expect(page.getByText("owner: app_owner")).toBeVisible();
  await expect(page.getByRole("cell", { name: "orders" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "customers" })).toBeVisible();

  await page
    .getByRole("complementary", { name: "Database objects" })
    .getByRole("button", { exact: true, name: "billing" })
    .click();

  await expect(page.getByRole("heading", { name: "billing" })).toBeVisible();
  await expect(page).toHaveURL(BILLING_SCHEMA_URL_RE);
  await expect(page.getByRole("cell", { name: "invoices" })).toBeVisible();
});

test("data explorer: filter selects a table and reads rows from mocked RPC", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  let readRowsBody: Record<string, unknown> | undefined;
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockReadRowsWithObserver(page, (body) => {
    readRowsBody = body;
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public"
  );
  await expect(page).toHaveURL(EXPLORER_URL_RE);
  await page.getByPlaceholder("Filter…").fill("ord");
  await page.getByRole("button", { name: ORDERS_BUTTON_RE }).click();

  // This catches route/search regressions and verifies the table grid requests
  // a bounded page from the selected resource, not an arbitrary SQL/backend call.
  await expect(page).toHaveURL(TABLE_CATEGORY_URL_RE);
  await expect(page).toHaveURL(ORDERS_NAME_URL_RE);
  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();
  await expect(page.getByText("ada@example.com")).toBeVisible();
  expect(readRowsBody).toMatchObject({ name: ORDERS_TABLE_NAME, pageSize: 50 });
});

test("data explorer: table detail tabs show catalog metadata", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await gotoExplorer(page, "?schema=public&category=tables&name=orders");

  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();
  await expect(page.getByText("ada@example.com")).toBeVisible();

  // Each tab maps to a separate mocked RPC, so accidental tab/query drift is
  // visible without turning this into a slow database-backed e2e test.
  await page.getByRole("tab", { name: "Columns" }).click();
  await expect(page.getByRole("cell", { name: "id" })).toBeVisible();
  await expect(page.getByText("PK")).toBeVisible();
  await expect(page.getByText("INDEXED")).toBeVisible();

  await page.getByRole("tab", { name: "Indexes" }).click();
  await expect(
    page.getByRole("cell", { name: "orders_email_idx" })
  ).toBeVisible();

  await page.getByRole("tab", { name: "Constraints" }).click();
  await expect(
    page.getByRole("cell", { name: "orders_customer_id_fkey" })
  ).toBeVisible();

  await page.getByRole("tab", { name: "Policies" }).click();
  await expect(
    page.getByRole("cell", { name: "orders_customer_read_policy" })
  ).toBeVisible();

  await page.getByRole("tab", { name: "Triggers" }).click();
  await expect(
    page.getByRole("cell", { name: "orders_audit_trigger" })
  ).toBeVisible();
});

test("data explorer: Lighthouse route covers manual accessibility contracts", {
  tag: ["@feat:data-explorer", "@a11y"],
}, async ({ makeAxeBuilder, page }) => {
  await gotoExplorer(page, "?schema=public&category=tables&name=orders");

  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();

  const results = await makeAxeBuilder().analyze();
  const seriousViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? "")
  );

  expect(seriousViolations).toEqual([]);
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
      snapshot.label || snapshot.role || snapshot.tagName === "input"
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
  const readRowsBodies: Record<string, unknown>[] = [];
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockPaginatedReadRows(page, (body) => readRowsBodies.push(body));

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );
  await expect(page.getByText("ada@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Sort" }).click();
  await page.getByText("Add sort column").click();
  await page.getByRole("option", { name: "email" }).click();
  await expect(
    page.getByRole("button", { name: SORT_WITH_ONE_COLUMN_RE })
  ).toBeVisible();
  await expect
    .poll(() => readRowsBodies.at(-1))
    .toMatchObject({
      orderBy: [{ column: "email", direction: "DIRECTION_ASC" }],
    });

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("grace@example.com")).toBeVisible();
  expect(readRowsBodies.at(-1)).toMatchObject({ pageToken: "page-2" });
});

test("data explorer: table errors and retry stay inside explorer shell", {
  tag: ["@feat:data-explorer", "@flow:error"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockRpcError({
    page,
    method: "ListTables",
    message: "catalog unavailable",
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public"
  );

  await expect(
    page.getByRole("complementary").getByText("Failed to load tables.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page).toHaveURL(EXPLORER_URL_RE);
});

test("data explorer: empty schema catalog shows a safe empty explorer", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockRpc(page, "SchemaService/ListSchemas", {
    nextPageToken: "",
    schemas: [],
  });
  await mockRpc(page, "ListSchemas", { nextPageToken: "", schemas: [] });

  await page.goto("/instances/production/databases/appdb/explorer");

  await expect(page).toHaveURL(EXPLORER_URL_RE);
  await expect(page.getByText("No schemas").first()).toBeVisible();
  await expect(page.getByPlaceholder("Filter…")).toBeVisible();
});

test("data explorer: empty table list keeps schema context visible", {
  tag: ["@feat:data-explorer", "@flow:navigate"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockRpc(page, "ListTables", { nextPageToken: "", tables: [] });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public"
  );

  await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
  await expect(page.getByText("No tables in this schema.")).toBeVisible();
  await expect(page).toHaveURL(EXPLORER_URL_RE);
});

test("data explorer: row read failure is inline and leaves table context intact", {
  tag: ["@feat:data-explorer", "@flow:error"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockRpcError({ page, method: "ReadRows", message: "read failed" });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );

  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();
  await expect(page.getByText("Failed to load rows")).toBeVisible();
  await expect(page.getByText("read failed")).toBeVisible();
  await expect(page).toHaveURL(ORDERS_NAME_URL_RE);
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

test.describe("data explorer grid metadata", () => {
  test.use({ locale: "en-US", timezoneId: "UTC" });

  test("data explorer: grid status bar keeps actionable warnings", {
    tag: ["@feat:data-explorer", "@flow:query"],
  }, async ({ page }) => {
    await mockExplorerShell(page);
    await mockTableCatalog(page);
    await mockRpc(page, "ReadRows", {
      limits: {
        effectiveCellBytes: 4096,
        effectiveResponseBytes: "1048576",
        maxCellBytes: 4096,
        maxFilterDepth: 8,
        maxFilterNodes: 64,
        maxPageSize: 500,
        maxResponseBytes: "1048576",
      },
      nextPageToken: "page-2",
      resultSet: {
        columns: orderColumns,
        observedAt: "2026-05-20T10:00:00Z",
        paginationStrategy: "PAGINATION_STRATEGY_OFFSET",
        rowCount: { status: "STATUS_UNAVAILABLE" },
        rowIdentity: { source: "SOURCE_OPAQUE_ROW_KEY" },
        rows: [
          {
            rowKey: "",
            values: [
              { value: { int64Value: "1" } },
              { value: { stringValue: "ada@example.com" } },
              { value: { jsonValue: '{"preview":true}' } },
            ],
          },
        ],
      },
    });

    await page.goto(
      "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
    );

    const statusBar = page.locator('[aria-label="Grid status"]');
    await expect(statusBar).toContainText("Offset pagination");
    await expect(statusBar).toContainText("No stable key");
    await expect(statusBar).toContainText("Response capped");
    await expect(statusBar).toContainText("Row actions limited; no PK");
    await expect(statusBar).not.toContainText("Count unavailable");
    await expect(statusBar).not.toContainText(
      "Observed May 20, 2026, 10:00 AM"
    );
  });
});

test("data explorer: filter selects a view and shows view detail", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockRpc(page, "ListViews", {
    nextPageToken: "",
    views: [
      {
        comment: "Customers with an active subscription",
        displayName: "active_accounts",
        name: "instances/production/databases/appdb/schemas/public/views/active_accounts",
        owner: "analytics_owner",
        viewType: "VIEW_TYPE_STANDARD",
      },
    ],
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public"
  );
  await page.getByPlaceholder("Filter…").fill("active");
  await page.getByRole("button", { name: ACTIVE_ACCOUNTS_BUTTON_RE }).click();

  await expect(page).toHaveURL(VIEW_CATEGORY_URL_RE);
  await expect(page).toHaveURL(ACTIVE_ACCOUNTS_NAME_URL_RE);
  await expect(
    page.getByRole("heading", { name: "active_accounts" })
  ).toBeVisible();
  await expect(page.getByText("owner: analytics_owner")).toBeVisible();
  await expect(
    page.getByText("Customers with an active subscription")
  ).toBeVisible();
});

test("data explorer: deep link round-trips selected schema table", {
  tag: ["@feat:data-explorer", "@flow:navigate"],
}, async ({ page }) => {
  let readRowsBody: Record<string, unknown> | undefined;
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockReadRowsWithObserver(page, (body) => {
    readRowsBody = body;
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );

  await expect(page).toHaveURL(EXPLORER_URL_RE);
  await expect(page).toHaveURL(TABLE_CATEGORY_URL_RE);
  await expect(page).toHaveURL(ORDERS_NAME_URL_RE);
  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();
  expect(readRowsBody).toMatchObject({
    name: ORDERS_TABLE_NAME,
  });
});

test("data explorer: renders null boolean json and long text cells", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockRpc(page, "ReadRows", {
    nextPageToken: "",
    resultSet: {
      columns: RICH_COLUMNS,
      observedAt: "2026-05-20T10:00:00Z",
      rowCount: { status: "STATUS_AVAILABLE", value: "1" },
      rowIdentity: { columnNames: ["id"], source: "SOURCE_PRIMARY_KEY" },
      rows: [
        {
          rowKey: "orders/1",
          values: [
            { value: { int64Value: "1" } },
            {},
            { value: { boolValue: true } },
            { value: { jsonValue: '{"tier":"enterprise","flags":["beta"]}' } },
            {
              fullSizeBytes: "160",
              fullValueToken: "long-text-token",
              truncated: true,
              value: {
                stringValue:
                  "This is a long preview that should stay readable in the grid",
              },
            },
          ],
        },
      ],
    },
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );

  await expect(page.getByText("NULL")).toBeVisible();
  await expect(page.getByLabel("true")).toBeVisible();
  await expect(page.getByText(TIER_ENTERPRISE_JSON_RE)).toBeVisible();
  await expect(
    page.getByText(
      "This is a long preview that should stay readable in the grid"
    )
  ).toBeVisible();
});

test("data explorer: freezes wide table columns and copies selected rows", {
  tag: ["@feat:data-explorer", "@flow:query"],
}, async ({ page }) => {
  let clipboardText = "";
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          window.querylaneE2eClipboard = value;
          return Promise.resolve();
        },
      },
    });
  });
  await mockExplorerShell(page);
  await mockTableCatalog(page);
  await mockRpc(page, "ReadRows", {
    nextPageToken: "",
    resultSet: {
      columns: orderColumns,
      observedAt: "2026-05-20T10:00:00Z",
      rowCount: { status: "STATUS_AVAILABLE", value: "2" },
      rowIdentity: { columnNames: ["id"], source: "SOURCE_PRIMARY_KEY" },
      rows: [
        {
          rowKey: "orders/1",
          values: [
            { value: { int64Value: "1" } },
            { value: { stringValue: "ada@example.com" } },
            { value: { jsonValue: '{"preview":true}' } },
          ],
        },
        {
          rowKey: "orders/2",
          values: [
            { value: { int64Value: "2" } },
            { value: { stringValue: "grace@example.com" } },
            { value: { jsonValue: '{"preview":false}' } },
          ],
        },
      ],
    },
  });

  await page.goto(
    "/instances/production/databases/appdb/explorer?schema=public&category=tables&name=orders"
  );
  await page
    .getByRole("button", { name: "Open options for column email" })
    .click();
  await page.getByText("Freeze column").click();
  await page
    .getByRole("button", { name: "Open options for column email" })
    .click();
  await expect(page.getByText("Unfreeze column")).toBeVisible();
  await page.getByText("Unfreeze column").click();

  await page.getByLabel("Select All").click();
  await page.getByRole("button", { name: COPY_BUTTON_RE }).click();
  await page.getByRole("menuitem", { name: "CSV" }).click();
  await expect
    .poll(async () => page.evaluate(() => window.querylaneE2eClipboard ?? ""))
    .toContain("ada@example.com");
  clipboardText = await page.evaluate(() => window.querylaneE2eClipboard ?? "");
  expect(clipboardText).toContain("grace@example.com");
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

test("data explorer: phone viewport opens the object browser in the sidebar drawer", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await gotoExplorer(page);

  const openMenu = page.getByRole("button", { name: "Open navigation menu" });
  await expect(openMenu).toBeVisible();

  await openMenu.click();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer).toBeVisible();
  const drawerWidth = await drawer.evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(drawerWidth).toBeGreaterThanOrEqual(OBJECT_BROWSER_PHONE_MIN_WIDTH);
  expect(drawerWidth).toBeLessThanOrEqual(OBJECT_BROWSER_PHONE_MAX_WIDTH);
  const objectBrowser = drawer.getByRole("complementary", {
    name: "Database objects",
  });
  await expect(objectBrowser).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Back to workspace" })
  ).toBeVisible();

  // Picking an object closes the drawer so the detail pane is visible.
  await drawer.getByRole("button", { name: ORDERS_BUTTON_RE }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(ORDERS_NAME_URL_RE);
});

test("data explorer: back to workspace restores the nav rail on the database overview", async ({
  page,
}) => {
  await gotoExplorer(page, "?schema=public&category=tables&name=orders");
  await expect(
    page.getByRole("heading", { name: ORDERS_HEADING_RE })
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to workspace" }).click();

  await expect(page).toHaveURL(DB_OVERVIEW_URL_RE);
  expect(page.url()).not.toContain("category=");
  expect(page.url()).not.toContain("name=");

  // Same rail now shows the workspace navigation again.
  await expect(
    page.getByRole("link", { exact: true, name: "Data Explorer" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to workspace" })
  ).not.toBeVisible();
});
