import type { Locator, Page } from "playwright/test";
import { expect, test } from "../tests/base";
import {
  ACTIVITY_URL,
  busyActivityFixture,
  CONFIGURATION_URL,
  DATABASE_URL,
  designExtensionsFixture,
  EXTENSIONS_URL,
  failInstanceLoadsWithMetaDatabaseOutage,
  INSTANCE_URL,
  instanceFixture,
  mockConsoleResources,
  queryInsightsFixture,
  rejectInstancePassword,
} from "./console-resource-fixtures";
import { expectActiveElement } from "./focus";

// Instance and database console routes with every RPC mocked. Component-level
// behavior for the same states is covered in
// backend-resource-pages.browser.test.tsx and
// instance-config.browser.test.tsx.

const BLOCKED_ACTIVITY_ROW_NAME =
  /4302.*api-gateway.*UPDATE shipping\.shipments/;
const PG_STAT_STATEMENTS_BUTTON_NAME = /pg_stat_statements/i;
const REPLICATION_ROW_NAME = /Replication/;
const SHARED_PRELOAD_LIBRARIES_TEXT = /Loaded via shared_preload_libraries/;
const TIMESCALEDB_BUTTON_NAME = /timescaledb/i;
const PHONE_VIEWPORT = { height: 844, width: 390 };
/** Tall enough that the longest pages fit inside their scrolling main. */
const TALL_VIEWPORT = { height: 1800, width: 1280 };
/** The full-width sparkline band at the bottom of every stat tile (h-7). */
const MOBILE_SPARKLINE_MIN_HEIGHT = 28;
const MOBILE_SPARKLINE_MIN_WIDTH = 112;
const SERVER_PASSWORD_ERROR =
  "PostgreSQL rejected this password. Check the password, then try again.";

// Page content only: the app shell has its own visual coverage.
function pageContent(page: Page) {
  return page.getByRole("main").last();
}

// The form card alone: save toasts float over the page corner.
function configurationCard(page: Page) {
  return innermost(page, '[data-slot="card"]', "Configuration");
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBe(0);
}

/** Checks a passive stat sparkline stays large, decorative, and inert. */
async function expectPassiveSparkline(page: Page, statStrip: Locator) {
  const sparkline = statStrip.locator('[aria-hidden="true"] svg').first();
  await expect(sparkline).toBeVisible();
  const box = await sparkline.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(MOBILE_SPARKLINE_MIN_WIDTH);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MOBILE_SPARKLINE_MIN_HEIGHT);
  await expect(page.locator('button[aria-label^="Expand"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

/** The innermost element matching `selector` that contains every text. */
function innermost(page: Page, selector: string, ...texts: string[]) {
  let locator = page.locator(selector);
  for (const text of texts) {
    locator = locator.filter({ has: page.getByText(text, { exact: true }) });
  }
  return locator.last();
}

test.describe("instance overview", () => {
  test.use({ viewport: TALL_VIEWPORT });

  test("live metrics and database catalog render together", async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await page.goto(INSTANCE_URL);

    const health = page.getByRole("region", { name: "Health checks" });
    await expect(
      health.getByText("primary with 2 attached replicas")
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "74 of 100 connections in use" })
    ).toBeVisible();
    await expect(pageContent(page).getByText("customer_events")).toBeVisible();

    await health.getByRole("button", { name: REPLICATION_ROW_NAME }).click();
    await expect(health.getByText("Streaming replicas")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-instance-overview.png"
    );
    await expect(health).toHaveScreenshot(
      "backend-instance-overview-health.png"
    );
  });

  test("cached catalog stays visible during a meta database outage", async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await page.goto(INSTANCE_URL);
    await expect(pageContent(page).getByText("customer_events")).toBeVisible();

    await failInstanceLoadsWithMetaDatabaseOutage(page);
    await page.getByRole("button", { name: "Refresh data" }).click();

    await expect(page.getByText("Meta database unavailable")).toBeVisible();
    await expect(page.getByText("Status unavailable")).toBeVisible();
    await expect(
      page.getByText("Showing the last loaded data until refresh succeeds.")
    ).toBeVisible();
    await expect(pageContent(page).getByText("customer_events")).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-instance-overview-meta-database-unavailable.png"
    );
  });

  test("passive sparklines stay large on phones", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await mockConsoleResources(page, { metrics: true });
    await page.goto(INSTANCE_URL);

    const statStrip = innermost(
      page,
      "main div.grid",
      "Connections",
      "Cache Hit Ratio"
    );
    await expectPassiveSparkline(page, statStrip);
    await expect(statStrip).toHaveScreenshot(
      "backend-instance-overview-stat-strip-mobile.png"
    );
  });
});

test.describe("instance activity", () => {
  test("live sessions show blocking chains and the session inspector", async ({
    page,
  }) => {
    await mockConsoleResources(page, { activity: busyActivityFixture });
    await page.goto(ACTIVITY_URL);

    await expect(page.getByText("blocker · pid 4211")).toBeVisible();
    await expect(page.getByText("Showing 1–5 of 5")).toBeVisible();
    await expect(
      page.locator('code.language-sql[data-syntax-highlighter="shiki"]')
    ).toHaveCount(8);

    await test.step("sessions table", async () => {
      await expect(pageContent(page)).toHaveScreenshot(
        "backend-instance-activity.png"
      );
    });

    await test.step("session inspector", async () => {
      await page
        .getByRole("button", { name: BLOCKED_ACTIVITY_ROW_NAME })
        .click();
      const inspector = page.getByRole("dialog", { name: "Session 4302" });
      await expect(inspector.getByText("Lock · transactionid")).toBeVisible();
      await expect(inspector.getByText("blocked by · pid 4211")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Terminate session…" })
      ).toHaveCount(0);

      // Timeline markers are filled dots: the rail must not show through.
      const marker = inspector
        .locator('ol > li > [aria-hidden="true"]')
        .first();
      const markerPng = await marker.screenshot();
      const centerDifference = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) {
          return Number.POSITIVE_INFINITY;
        }
        context.drawImage(image, 0, 0);
        const centerX = Math.floor(image.width / 2);
        const centerY = Math.floor(image.height / 2);
        const offsetX = Math.min(image.width - 1, centerX + 2);
        const center = context.getImageData(centerX, centerY, 1, 1).data;
        const offset = context.getImageData(offsetX, centerY, 1, 1).data;
        return Math.max(
          ...Array.from(center, (channel, index) =>
            Math.abs(channel - (offset[index] ?? 0))
          )
        );
      }, markerPng.toString("base64"));
      expect(centerDifference).toBeLessThanOrEqual(1);

      await expect(inspector).toHaveScreenshot(
        "backend-instance-activity-inspector.png"
      );
    });
  });

  test("empty session list keeps pagination in place", async ({ page }) => {
    await mockConsoleResources(page);
    await page.goto(ACTIVITY_URL);

    await expect(page.getByText("No sessions found")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next page" })
    ).toBeDisabled();
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-instance-activity-empty.png"
    );
  });

  test("missing activity data explains the gap", async ({ page }) => {
    await mockConsoleResources(page, { activity: null });
    await page.goto(ACTIVITY_URL);

    await expect(page.getByText("Activity data unavailable")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-instance-activity-unavailable.png"
    );
  });

  test("disconnected instance pauses live activity", async ({ page }) => {
    await mockConsoleResources(page, {
      activity: busyActivityFixture,
      instance: {
        ...instanceFixture,
        connectionState: "CONNECTION_STATE_UNSPECIFIED",
      },
    });
    await page.goto(ACTIVITY_URL);

    await expect(page.getByText("Activity unavailable")).toBeVisible();
    await expect(page.getByText("Loading activity…")).toHaveCount(0);
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-instance-activity-disconnected.png"
    );
  });
});

test.describe("database overview", () => {
  test("mission control stats and catalog tables", async ({ page }) => {
    await mockConsoleResources(page);
    await page.goto(DATABASE_URL);

    await expect(page.getByText("daily_rollup")).toBeVisible();
    await expect(page.getByText("Query statistics are off")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-database-overview.png"
    );
  });

  test("bounded catalog sample stays qualified", async ({ page }) => {
    await mockConsoleResources(page, { schemasTruncated: true });
    await page.goto(DATABASE_URL);

    await expect(
      page.getByRole("status", { name: "Some catalog data is not shown" })
    ).toBeVisible();
    await expect(page.getByText("2+ schemas")).toBeVisible();
    await expect(pageContent(page)).toHaveScreenshot(
      "backend-database-overview-partial-catalog.png"
    );
  });

  test("passive sparklines stay large on phones", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await mockConsoleResources(page, { metrics: true });
    await page.goto(DATABASE_URL);

    const statStrip = innermost(page, '[data-slot="card"]', "Total size");
    await expectPassiveSparkline(page, statStrip);
    await expect(statStrip).toHaveScreenshot(
      "backend-database-overview-stat-strip-mobile.png"
    );
  });

  test("query insights drawer and its active filters", async ({ page }) => {
    await mockConsoleResources(page, { queryInsights: queryInsightsFixture() });
    await page.goto(DATABASE_URL);
    await page.getByRole("button", { exact: true, name: "Insights" }).click();

    const drawer = page.getByRole("dialog", { name: "Query insights" });
    await expect(drawer.getByText("Sequential scan hotspots")).toBeVisible();
    await expect(drawer.getByText("Cache hit by table")).toBeVisible();

    await test.step("drawer", async () => {
      await expect(drawer).toHaveScreenshot(
        "backend-database-query-insights-drawer.png"
      );
    });

    await test.step("active filters", async () => {
      await drawer
        .getByRole("textbox", { name: "Search queries…" })
        .fill("SELECT");
      await drawer.getByRole("button", { name: "Type" }).click();
      await page.getByRole("option", { name: "Read queries" }).click();
      await drawer.getByText("Top queries by total time").click();
      await expect(
        drawer.getByRole("button", { name: "Type Read queries" })
      ).toBeVisible();
      await expect(
        drawer.getByRole("button", { name: "Clear all" })
      ).toBeVisible();
      await expect(
        innermost(page, '[data-slot="card"]', "Top queries by total time")
      ).toHaveScreenshot("backend-database-query-insights-active-filters.png");
    });
  });

  test("query statistics retry clears its notice on phones", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await mockConsoleResources(page, {
      queryInsights: queryInsightsFixture({ queryStatsAvailable: false }),
    });
    await page.goto(DATABASE_URL);
    await page.getByRole("button", { exact: true, name: "Insights" }).click();

    const title = page.getByText("Query statistics unavailable", {
      exact: true,
    });
    const retry = page.getByRole("button", { name: "Retry query statistics" });
    await expect(title).toBeVisible();
    await expect(retry).toBeVisible();
    const titleBox = await title.boundingBox();
    const retryBox = await retry.boundingBox();
    expect(retryBox?.y ?? 0).toBeGreaterThanOrEqual(
      (titleBox?.y ?? 0) + (titleBox?.height ?? 0)
    );
  });
});

test.describe("database extensions", () => {
  test("installed inventory and details drawer", async ({ page }) => {
    await mockConsoleResources(page, { extensions: designExtensionsFixture });
    await page.goto(EXTENSIONS_URL);

    await expect(page.getByText("Observability")).toBeVisible();
    await test.step("inventory", async () => {
      await expect(pageContent(page)).toHaveScreenshot(
        "backend-database-extensions.png"
      );
    });

    await test.step("details drawer", async () => {
      await page
        .getByRole("button", { name: PG_STAT_STATEMENTS_BUTTON_NAME })
        .click();
      const drawer = page.getByRole("dialog", {
        name: "pg_stat_statements details",
      });
      await expect(
        drawer.getByText(SHARED_PRELOAD_LIBRARIES_TEXT)
      ).toBeVisible();
      await drawer.getByRole("button", { name: "What it gives you" }).click();
      await expect(drawer.getByText("track_planning setting")).toBeVisible();
      await expect(drawer).toHaveScreenshot(
        "backend-database-extensions-drawer.png"
      );
    });
  });

  test("available extension search and details drawer", async ({ page }) => {
    await mockConsoleResources(page, { extensions: designExtensionsFixture });
    await page.goto(EXTENSIONS_URL);

    await page
      .getByRole("textbox", { name: "Search extensions…" })
      .fill("timescaledb");
    await expect(page.getByText("1 of 7 extensions")).toBeVisible();
    await test.step("filtered inventory", async () => {
      await expect(pageContent(page)).toHaveScreenshot(
        "backend-database-extensions-available.png"
      );
    });

    await test.step("details drawer", async () => {
      await page.getByRole("button", { name: TIMESCALEDB_BUTTON_NAME }).click();
      const drawer = page.getByRole("dialog", { name: "timescaledb details" });
      await expect(
        drawer.getByText("Not installed in this database")
      ).toBeVisible();
      await expect(drawer).toHaveScreenshot(
        "backend-database-extensions-available-drawer.png"
      );
    });
  });
});

test.describe("instance configuration", () => {
  test.use({ viewport: TALL_VIEWPORT });

  test("editable connection fields and labels", async ({ page }) => {
    await mockConsoleResources(page);
    await page.goto(CONFIGURATION_URL);

    await expect(page.getByLabel("Host", { exact: true })).toHaveValue(
      "analytics-writer.internal.querylane.test"
    );
    await expect(configurationCard(page)).toHaveScreenshot(
      "instance-config-editable.png"
    );
  });

  test("client validation errors sit next to their fields", async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await page.goto(CONFIGURATION_URL);

    await page.getByLabel("Host", { exact: true }).fill("");
    await page.getByLabel("Port", { exact: true }).fill("65536");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Host is required.")).toBeVisible();
    await expect(
      page.getByText("Port must be between 1 and 65535.")
    ).toBeVisible();
    await expect(configurationCard(page)).toHaveScreenshot(
      "instance-config-validation-errors.png"
    );
  });

  test("server field errors anchor to the rejected field", async ({ page }) => {
    await mockConsoleResources(page);
    await rejectInstancePassword(page, SERVER_PASSWORD_ERROR);
    await page.goto(CONFIGURATION_URL);

    const password = page.getByRole("textbox", { name: "Password" });
    await password.fill("wrong-password");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(
      pageContent(page).getByText(SERVER_PASSWORD_ERROR)
    ).toBeVisible();
    await expectActiveElement(password);
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(configurationCard(page)).toHaveScreenshot(
      "instance-config-server-field-errors.png"
    );
  });

  test("config-managed instances are read-only", async ({ page }) => {
    await mockConsoleResources(page, { configManaged: true });
    await page.goto(CONFIGURATION_URL);

    await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();
    await expect(configurationCard(page)).toHaveScreenshot(
      "instance-config-managed.png"
    );
  });

  test("delete confirmation makes the destructive action explicit", async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await page.goto(CONFIGURATION_URL);

    await page
      .getByTestId("instance-danger-zone")
      .getByRole("button", { name: "Delete instance" })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("heading", { name: "Delete instance?" })
    ).toBeVisible();
    await expect(dialog).toHaveScreenshot("instance-delete-confirmation.png");
  });

  test("credential recovery action clears the alert copy on phones", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 320 });
    await mockConsoleResources(page, {
      instance: {
        ...instanceFixture,
        credentialError:
          "Stored credentials cannot be read. Re-enter the password to restore access.",
        credentialState: "CREDENTIAL_STATE_UNREADABLE",
      },
    });
    await page.goto(CONFIGURATION_URL);

    const title = page.getByText("Credentials need attention");
    const action = page.getByRole("button", { name: "Re-enter password" });
    await expect(title).toBeVisible();
    await expect(action).toBeVisible();
    const titleBox = await title.boundingBox();
    const actionBox = await action.boundingBox();
    if (!(titleBox && actionBox)) {
      throw new Error("Expected credential alert title and action boxes");
    }
    const overlaps =
      titleBox.x < actionBox.x + actionBox.width &&
      titleBox.x + titleBox.width > actionBox.x &&
      titleBox.y < actionBox.y + actionBox.height &&
      titleBox.y + titleBox.height > actionBox.y;
    expect(overlaps).toBe(false);
  });
});

// Streamed SQL feeds this panel, so it renders in the visual harness.
test.describe("database objects", () => {
  for (const { name, ready } of [
    { name: "grid", ready: "partman-maintenance" },
    { name: "loading", ready: "Database objects" },
  ] as const) {
    test(`${name} state`, async ({ page }) => {
      await page.goto(`/visual.html?scenario=database-objects-${name}`);
      const frame = page.getByTestId("visual-frame");
      await expect(frame.getByText(ready, { exact: true })).toBeVisible();
      await expect(frame).toHaveScreenshot(`database-objects-${name}.png`);
    });
  }
});
