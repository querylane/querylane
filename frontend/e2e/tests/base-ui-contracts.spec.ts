import { expect, test } from "./base";
import { mockReadyEmptyApp } from "./helpers";

test("Base UI select restores trigger focus after keyboard dismissal", {
  tag: ["@base-ui-cross-browser", "@feat:instances", "@flow:query"],
}, async ({ page }) => {
  await mockReadyEmptyApp(page);
  await page.goto("/new-instance");
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();

  const sslModeTrigger = page.getByRole("combobox", { name: "SSL mode" });

  await test.step("open the popup from the keyboard", async () => {
    await sslModeTrigger.focus();
    await sslModeTrigger.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
  });

  await test.step("dismiss the popup and restore trigger focus", async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(sslModeTrigger).toBeFocused();
  });
});
