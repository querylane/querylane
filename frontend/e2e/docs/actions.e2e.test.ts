import { stat } from "node:fs/promises";
import { expect, test } from "playwright/test";

const EPUB = /\.epub$/u;

test("exports the current documentation page as an EPUB", async ({ page }) => {
  await page.goto("/get-started");
  await page.getByText("Export", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export to EPUB", exact: true })
    .click();
  const epub = await download;
  expect(epub.suggestedFilename()).toMatch(EPUB);
  expect(await epub.failure()).toBeNull();
  const saved = await stat(await epub.path());
  expect(saved.size).toBeGreaterThan(1500);
});
