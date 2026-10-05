import { stat } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { installBrowserVoice } from "./voice";

const LISTEN = /^Listen to this page/;
const EPUB = /\.epub$/;
const INSTANCE_NAME = /^name string/;

test("listen, pause, resume, stop, and leave a page", async ({ page }) => {
  await installBrowserVoice(page);
  await page.goto("/get-started");
  await page.getByRole("button", { name: LISTEN }).click();
  await expect
    .poll(() => page.evaluate(() => speechSynthesis.speaking))
    .toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true })
  ).toBeVisible();
  await expect(page.locator("[data-blume-narration-player]")).toHaveScreenshot(
    "narration-paused.png"
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page
    .getByRole("button", { name: "Stop listening", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => speechSynthesis.speaking))
    .toBe(false);
  await page.getByRole("button", { name: LISTEN }).click();
  await page
    .getByRole("link", { name: "Configure Querylane", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Configure Querylane", exact: true })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => speechSynthesis.speaking))
    .toBe(false);
});

test("export the current page as EPUB and invoke PDF printing", async ({
  page,
}, testInfo) => {
  await page.goto("/get-started");
  if (testInfo.project.name === "docs-mobile") {
    await expect(page.getByText("Export", { exact: true })).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.getByText("Export", { exact: true }).click();
  await expect(page.locator("[data-blume-page-actions]")).toHaveScreenshot(
    "page-actions.png"
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export to EPUB", exact: true })
    .click();
  const epub = await downloaded;
  expect(epub.suggestedFilename()).toMatch(EPUB);
  expect(await epub.failure()).toBeNull();
  const path = await epub.path();
  if (!path) {
    throw new Error("EPUB did not save");
  }
  expect((await stat(path)).size).toBeGreaterThan(1500);
  await page.evaluate(() => {
    window.print = () =>
      document.documentElement.setAttribute("data-printed", "true");
  });
  await page
    .getByRole("button", { name: "Export to PDF", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-printed", "true");
});

test("an unsupported browser language keeps the English docs usable", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await context.close();
});

test("all 18 request samples follow edits without losing RPC presentation", async ({
  page,
}) => {
  await page.goto("/api/instance/instance-service-get-instance");
  await page.getByText("Try it", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Custom base URL" })
    .fill("https://api.example.com");
  await page
    .getByRole("textbox", { name: INSTANCE_NAME })
    .fill("instances/docs-demo");
  const tabs = page
    .getByRole("tablist", { name: "Request", exact: true })
    .getByRole("tab");
  await expect(tabs).toHaveCount(18);
  await (await tabs.all()).reduce(async (previous, tab) => {
    await previous;
    await tab.click();
    const panel = page
      .getByRole("tabpanel")
      .filter({ hasText: "instances/docs-demo" });
    await expect(panel).toContainText(
      "https://api.example.com/querylane.console.v1alpha1.InstanceService/GetInstance"
    );
    await expect(panel).toContainText("Connect-Protocol-Version");
  }, Promise.resolve());
  await expect(
    page.getByText("Unary RPC", { exact: true }).first()
  ).toBeVisible();
});
