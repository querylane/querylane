import { expect, test } from "./browser.test-utils";
import { mockDataExplorerApp } from "./data-explorer.fixture";
import { mockOverviewSupportData } from "./querylane-rpc.fixture";

const PRODUCTION_INSTANCE_URL_RE = /\/instances\/production\/?$/u;

const APPDB_DATABASE_URL_RE = /\/instances\/production\/databases\/appdb\/?$/u;
const APPDB_EXPLORER_URL_RE =
  /\/instances\/production\/databases\/appdb\/explorer/u;
const CATEGORY_SEARCH_RE = /[?&]category=/u;
const NAME_SEARCH_RE = /[?&]name=/u;

const PUBLIC_ORDERS_HEADING_RE = /public\.orders/u;

test.beforeEach(async ({ page }) => {
  await mockOverviewSupportData(page);
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
