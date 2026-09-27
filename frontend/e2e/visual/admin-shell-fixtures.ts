import type { Page } from "playwright/test";
import {
  type CatalogFixture,
  DATABASE_URL,
  databaseFixture,
  instanceFixture,
  mockConsoleResources,
} from "./console-resource-fixtures";

// Long display names stress the header, breadcrumbs, and sidebar truncation.
// Mirrors the fixtures in admin-shell.rstest-browser.test.tsx.

const LONG_INSTANCE_NAME = "Production Analytics Writer With Long Display Name";
const LONG_DATABASE_NAME = "customer_events_with_long_identifier";
const SCHEMA = `${String(databaseFixture["name"])}/schemas/public`;

const longDatabase = { ...databaseFixture, displayName: LONG_DATABASE_NAME };

function table(displayName: string, rowCount: string) {
  return {
    displayName,
    name: `${SCHEMA}/tables/${displayName}`,
    owner: "data-platform",
    rowCount,
    sizeBytes: "1048576",
    tableType: "TABLE_TYPE_BASE_TABLE",
  };
}

const shippingCatalog: CatalogFixture = {
  schemas: [
    {
      displayName: "public",
      isSystemSchema: false,
      name: SCHEMA,
      owner: "data-platform",
    },
  ],
  tables: {
    public: [
      table("carriers", "312"),
      table("containers", "88000"),
      table("shipment_event", "18200000"),
      table("shipments", "2400000"),
    ],
  },
  views: {
    public: [
      {
        displayName: "active_shipments",
        isPopulated: true,
        name: `${SCHEMA}/views/active_shipments`,
        owner: "data-platform",
        rowCount: "0",
        sizeBytes: "0",
        viewType: "VIEW_TYPE_STANDARD",
      },
    ],
  },
};

/** The database overview inside the full app shell, config-managed. */
async function openAdminShell(page: Page, { degraded = false } = {}) {
  await mockConsoleResources(page, {
    catalog: shippingCatalog,
    configManaged: true,
    database: longDatabase,
    databases: [
      longDatabase,
      {
        ...databaseFixture,
        displayName: "warehouse",
        name: `${String(instanceFixture["name"])}/databases/warehouse`,
      },
    ],
    degraded,
    instance: { ...instanceFixture, displayName: LONG_INSTANCE_NAME },
  });
  await page.goto(DATABASE_URL);
  await page
    .getByRole("main")
    .last()
    .getByRole("heading", { name: LONG_DATABASE_NAME })
    .waitFor();
}

export { LONG_DATABASE_NAME, LONG_INSTANCE_NAME, openAdminShell };
