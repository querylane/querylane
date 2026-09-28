import type { Page } from "playwright/test";
import {
  CHANGE_LOG_DEFINITION_SCHEMA,
  CHILD_PARTITION_SCHEMA,
  CUSTOMERS_CONSTRAINT_STATES,
  changeLogPartitionsSchema,
  customersSchema,
  INVOICES_SCHEMA,
  type SchemaFixture,
  SHIPMENT_EVENT_BULK_TRIGGERS,
  SHIPMENT_EVENT_CONSTRAINTS,
  SHIPMENT_EVENT_PAGINATED_CONSTRAINTS,
  SHIPMENT_EVENT_TRIGGERS,
  SHIPMENTS_COLUMNS_SCHEMA,
  SHIPMENTS_PAGINATED_INDEXES,
  SHIPMENTS_USAGE_INDEXES,
  shipmentEventSchema,
  shipmentIndexesSchema,
} from "../../src/test/fixtures/data-explorer-surface-fixtures";
import { expect, test } from "../tests/base";
import {
  mockExplorerSurfaces,
  tableUrl,
} from "./data-explorer-surface-fixtures";

// Table detail tabs of the data explorer, opened through the real explorer
// route with every catalog RPC mocked.

const FETCHED_AT = new Date("2024-01-01T23:00:00Z");
const TALL_VIEWPORT = { height: 1300, width: 1280 };
const DEFINITION_VIEWPORT = { height: 1800, width: 1280 };
const NARROW_VIEWPORT = { height: 1000, width: 480 };

// Page content only: the app shell has its own visual coverage.
function pageContent(page: Page) {
  return page.getByRole("main").last();
}

async function openTable(
  page: Page,
  { schema, tab, table }: { schema: SchemaFixture; tab?: string; table: string }
) {
  await mockExplorerSurfaces(page, { schemas: [schema] });
  await page.goto(tableUrl(schema.name, table, tab));
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FETCHED_AT);
});

test.describe("columns", () => {
  test("match the redesign inventory", async ({ page }) => {
    await openTable(page, {
      schema: SHIPMENTS_COLUMNS_SCHEMA,
      tab: "columns",
      table: "shipments",
    });

    await expect(
      page.getByText("Human-readable booking reference")
    ).toBeVisible();
    await expect(page.getByText("Showing 1–10 of 11")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-columns.png");
  });
});

test.describe("keys", () => {
  test("preserve the relationship view", async ({ page }) => {
    await openTable(page, {
      schema: customersSchema(),
      tab: "keys",
      table: "customers",
    });

    await expect(
      page.getByText("account_id → public.accounts(id)")
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-keys.png");
  });
});

test.describe("indexes", () => {
  test("have a redesigned table baseline", async ({ page }) => {
    await openTable(page, {
      schema: customersSchema(),
      tab: "indexes",
      table: "customers",
    });

    await expect(
      page.getByTitle("(status, account_id) INCLUDE (last_seen_at)")
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-indexes.png");
  });

  test("match the complex usage scenario", async ({ page }) => {
    await openTable(page, {
      schema: shipmentIndexesSchema(SHIPMENTS_USAGE_INDEXES),
      tab: "indexes",
      table: "shipments",
    });

    await expect(page.getByText("shipments_legacy_ref_idx")).toBeVisible();
    await expect(page.getByText("99.7%")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "table-indexes-complex.png"
    );
  });

  test("paginate dense index lists", async ({ page }) => {
    await openTable(page, {
      schema: shipmentIndexesSchema(SHIPMENTS_PAGINATED_INDEXES),
      tab: "indexes",
      table: "shipments",
    });

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Showing 11–11 of 11")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "table-indexes-pagination.png"
    );
  });
});

test.describe("constraints", () => {
  test("match the redesigned table", async ({ page }) => {
    await openTable(page, {
      schema: shipmentEventSchema({ constraints: SHIPMENT_EVENT_CONSTRAINTS }),
      tab: "constraints",
      table: "shipment_event",
    });

    await expect(page.getByText("shipping.shipments ↗")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-constraints.png");
  });

  test("paginate the dense table", async ({ page }) => {
    await openTable(page, {
      schema: shipmentEventSchema({
        constraints: SHIPMENT_EVENT_PAGINATED_CONSTRAINTS,
      }),
      tab: "constraints",
      table: "shipment_event",
    });

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Showing 11–11 of 11")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "table-constraints-pagination.png"
    );
  });

  test("cover validation and action states", async ({ page }) => {
    await openTable(page, {
      schema: customersSchema({ constraints: CUSTOMERS_CONSTRAINT_STATES }),
      tab: "constraints",
      table: "customers",
    });

    await expect(page.getByText("Not valid", { exact: true })).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "table-constraint-states.png"
    );
  });
});

test.describe("policies", () => {
  test("show a single permissive policy", async ({ page }) => {
    await openTable(page, {
      schema: customersSchema(),
      tab: "policies",
      table: "customers",
    });

    await expect(
      page.getByRole("heading", {
        exact: true,
        name: "customers_account_read_policy",
      })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-policies.png");
  });

  test("explain RLS composition", async ({ page }) => {
    await page.setViewportSize(TALL_VIEWPORT);
    await openTable(page, {
      schema: INVOICES_SCHEMA,
      tab: "policies",
      table: "invoices",
    });

    await expect(
      page.getByText("2 permissive policies apply", { exact: false })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "table-policies-rls-composition.png"
    );
  });
});

test.describe("triggers", () => {
  test("show a single trigger", async ({ page }) => {
    await openTable(page, {
      schema: customersSchema(),
      tab: "triggers",
      table: "customers",
    });

    await expect(
      page.getByText("customers_audit_trigger").first()
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-triggers.png");
  });

  test("match the redesign across filter states", async ({ page }) => {
    await openTable(page, {
      schema: shipmentEventSchema({ triggers: SHIPMENT_EVENT_TRIGGERS }),
      tab: "triggers",
      table: "shipment_event",
    });
    const stateFilter = page.getByRole("button", {
      exact: true,
      name: "State",
    });

    await test.step("all triggers", async () => {
      await expect(
        page.getByText("→ shipping.enrich_event_location()")
      ).toBeVisible();
      await expect(pageContent(page)).toHaveScreenshot(
        "table-triggers-redesign.png"
      );
      await expect(
        page.getByTestId("data-explorer-table-triggers")
      ).toHaveScreenshot("table-trigger-card-states.png");
    });

    await test.step("state filter open", async () => {
      await stateFilter.click();
      await expect(
        page.getByRole("option", { exact: true, name: "Disabled" })
      ).toBeVisible();
      await expect(pageContent(page)).toHaveScreenshot(
        "table-trigger-filter-open.png"
      );
    });

    await test.step("no matching triggers", async () => {
      await page.getByRole("option", { exact: true, name: "Disabled" }).click();
      await page
        .getByRole("button", { exact: true, name: "State Disabled" })
        .click();
      await page
        .getByRole("textbox", { exact: true, name: "Search triggers…" })
        .fill("missing");
      await expect(page.getByText("No triggers found")).toBeVisible();
      await expect(pageContent(page)).toHaveScreenshot(
        "table-trigger-filter-empty.png"
      );
    });
  });

  test("paginate dense trigger cards", async ({ page }) => {
    await openTable(page, {
      schema: shipmentEventSchema({ triggers: SHIPMENT_EVENT_BULK_TRIGGERS }),
      tab: "triggers",
      table: "shipment_event",
    });

    const footer = page.locator('[data-slot="pagination-footer"]').filter({
      has: page.getByRole("combobox", { name: "Triggers per page" }),
    });
    await expect(footer.getByText("Page 1 of 2")).toBeVisible();
    await expect(footer).toHaveScreenshot("table-trigger-pagination.png");
  });
});

test.describe("data", () => {
  test("has a visual baseline", async ({ page }) => {
    await openTable(page, { schema: customersSchema(), table: "customers" });

    await expect(page.getByText("customer_id_1")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-data.png");
  });
});

test.describe("definition", () => {
  test("has a visual baseline", async ({ page }) => {
    await page.setViewportSize(DEFINITION_VIEWPORT);
    await openTable(page, {
      schema: CHANGE_LOG_DEFINITION_SCHEMA,
      tab: "definition",
      table: "change_log",
    });

    await expect(
      page.getByRole("heading", { name: "Reproduce locally" })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-definition.png");
  });

  test("keeps the reproduce steps readable when narrow", async ({ page }) => {
    await page.setViewportSize(NARROW_VIEWPORT);
    await openTable(page, {
      schema: CHANGE_LOG_DEFINITION_SCHEMA,
      tab: "definition",
      table: "change_log",
    });

    const reproduceCard = page
      .locator('[data-slot="card"]')
      .filter({
        has: page.getByRole("heading", { name: "Reproduce locally" }),
      })
      .last();
    await expect(
      reproduceCard.getByRole("region", { name: "Dump schema only command" })
    ).toBeVisible();
    await expect(reproduceCard).toHaveScreenshot(
      "table-definition-reproduce-narrow.png"
    );
  });
});

test.describe("partitions", () => {
  test("match the redesign fixture", async ({ page }) => {
    await openTable(page, {
      schema: changeLogPartitionsSchema(),
      tab: "partitions",
      table: "change_log",
    });

    await expect(
      page.getByText("The DEFAULT partition holds 46%", { exact: false })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot("table-partitions.png");
  });

  test("child partition shows parent metadata", async ({ page }) => {
    await openTable(page, {
      schema: CHILD_PARTITION_SCHEMA,
      tab: "partitions",
      table: "events_2024",
    });

    await expect(
      page.getByText("analytics.events", { exact: true })
    ).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "table-child-partition.png"
    );
  });
});
