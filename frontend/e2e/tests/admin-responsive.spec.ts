import type { Locator, Page } from "playwright/test";
import { expect, test } from "./base";
import {
  mockApiManagedReadyConsole,
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyAppWithInstance,
  mockReadyOnboarding,
  sampleDatabase,
  sampleInstance,
} from "./helpers";

const PRODUCTION_CONFIGURATION_URL_RE =
  /\/instances\/production\/configuration\/?$/;
const ADMIN_DRAWER_MIN_WIDTH = 280;
const ADMIN_DRAWER_MAX_WIDTH = 292;

async function expectNoPageHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth
    )
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectNoElementHorizontalOverflow(locator: Locator) {
  const overflow = await locator.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectElementWidthBetween(
  locator: Locator,
  minWidth: number,
  maxWidth: number
) {
  const width = await locator.evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(width).toBeGreaterThanOrEqual(minWidth);
  expect(width).toBeLessThanOrEqual(maxWidth);
}

async function expectHeaderChildrenDoNotOverlap(page: Page) {
  const overlapCount = await page.getByRole("banner").evaluate((header) => {
    const rects = Array.from(header.children)
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .sort((left, right) => left.left - right.left);

    return rects.filter((rect, index) => {
      const previous = rects[index - 1];
      return Boolean(previous && rect.left < previous.right - 1);
    }).length;
  });

  expect(overlapCount).toBe(0);
}

async function expectResponsiveStylesLoaded(page: Page) {
  await page.waitForFunction(() => {
    const header = document.querySelector("header");
    if (!header) {
      return false;
    }
    const style = getComputedStyle(header);
    return style.display === "flex" && style.overflowX === "hidden";
  });
}

async function mockLongAdminPath(page: Page) {
  const instance = {
    ...sampleInstance,
    config: {
      ...sampleInstance.config,
      host: "analytics-writer-primary.internal.querylane.example",
    },
    displayName: "Production analytics writer cluster with very long label",
  };
  const database = {
    ...sampleDatabase,
    displayName: "customer_events_ingestion_pipeline_archive_2026_reporting",
  };

  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [instance]);
  await mockInstanceDetails(page, instance);
  await mockDatabases(page, [database]);
  await mockDatabaseDetails(page, database);
}

test("admin header: phone viewport exposes sidebar navigation", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await mockReadyAppWithInstance(page);
  await mockDatabaseDetails(page, sampleDatabase);

  await page.goto("/instances/production/databases/appdb");
  await expectResponsiveStylesLoaded(page);

  await expect(page.getByRole("heading", { name: "appdb" })).toBeVisible();

  const menu = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menu).toBeVisible();

  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer).toBeVisible();
  await expectElementWidthBetween(
    drawer,
    ADMIN_DRAWER_MIN_WIDTH,
    ADMIN_DRAWER_MAX_WIDTH
  );

  await page.getByRole("link", { name: "Configuration" }).click();
  await expect(page).toHaveURL(PRODUCTION_CONFIGURATION_URL_RE);
});

test("admin header: long breadcrumb stays contained on phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await mockLongAdminPath(page);

  await page.goto("/instances/production/databases/appdb");
  await expectResponsiveStylesLoaded(page);

  await expect(
    page.getByRole("heading", {
      name: "customer_events_ingestion_pipeline_archive_2026_reporting",
    })
  ).toBeVisible();

  await expectHeaderChildrenDoNotOverlap(page);
  await expectNoElementHorizontalOverflow(page.getByRole("banner"));
  await expectNoElementHorizontalOverflow(page.getByRole("main").last());
  await expectNoPageHorizontalOverflow(page);
});

test("admin header: long breadcrumb stays contained on tablet viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 768 });
  await mockLongAdminPath(page);

  await page.goto("/instances/production/databases/appdb");
  await expectResponsiveStylesLoaded(page);

  await expect(
    page.getByRole("heading", {
      name: "customer_events_ingestion_pipeline_archive_2026_reporting",
    })
  ).toBeVisible();

  await expectHeaderChildrenDoNotOverlap(page);
  await expectNoElementHorizontalOverflow(page.getByRole("banner"));
  await expectNoElementHorizontalOverflow(page.getByRole("main").last());
  await expectNoPageHorizontalOverflow(page);
});

test("instance overview: database controls remain usable on phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 320 });
  await mockReadyAppWithInstance(page);

  await page.goto("/instances/production");
  await expectResponsiveStylesLoaded(page);

  await expect(
    page.getByRole("heading", { name: "Production Postgres" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh data" })
  ).toBeVisible();

  const filter = page.getByRole("textbox", { name: "Filter databases..." });
  await expect(filter).toBeVisible();
  await filter.fill("app");

  await expect(page.getByRole("cell", { name: "appdb" })).toBeVisible();
  await expectNoPageHorizontalOverflow(page);
});
