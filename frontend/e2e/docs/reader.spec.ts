import { expect, test } from "playwright/test";
import { installBrowserVoice } from "./voice";

const SEARCH = /^Search/;
const NO_RESULTS = /No results/;
const CONFIGURE = /^Configure Querylane/;
const INSTANCE_NAME = /^name string/;

test.beforeEach(async ({ page }) => {
  await installBrowserVoice(page);
});

test("read the quickstart and search without leaving the docs", async ({
  page,
}) => {
  await page.goto("/get-started");
  await expect(
    page.getByRole("heading", { name: "Quickstart", exact: true })
  ).toBeVisible();
  await expect(page).toHaveScreenshot("quickstart.png");
  await page.getByRole("button", { name: SEARCH }).click();
  const search = page.getByRole("combobox");
  await search.fill("zzzz-no-querylane-results");
  await expect(page.getByText(NO_RESULTS)).toBeVisible();
  await search.fill("configure");
  await page.getByRole("option", { name: CONFIGURE }).click();
  await expect(
    page.getByRole("heading", { name: "Configure Querylane", exact: true })
  ).toBeVisible();
});

test("Go request stays synchronized with playground input", async ({
  page,
}) => {
  await page.goto("/api/instance/instance-service-get-instance");
  await page.getByRole("tab", { name: "Go", exact: true }).click();
  await page.getByText("Try it", { exact: true }).click();
  await page
    .getByRole("textbox", { name: INSTANCE_NAME })
    .fill("instances/docs-demo");
  await expect(
    page.getByRole("tabpanel").filter({ hasText: "package main" })
  ).toContainText("instances/docs-demo");
  await expect(page).toHaveScreenshot("api-go.png");
});
