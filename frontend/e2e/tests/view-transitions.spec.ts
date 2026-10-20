import type { Page } from "playwright/test";
import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";
import { mockRpc } from "./helpers";

const EXPLORER_URL = /\/instances\/production\/databases\/appdb\/explorer/u;
const DATABASE_URL = /\/instances\/production\/databases\/appdb\/?$/u;
type Motion =
  | "no-preference"
  | "reduce"
  | "unsupported"
  | "untyped"
  | "dark"
  | "mobile";

async function openDatabase(page: Page, motion: Motion) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  if (motion === "mobile") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.emulateMedia({
    colorScheme: motion === "dark" ? "dark" : "light",
    reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
  });
  await page.addInitScript((mode) => {
    if (mode === "unsupported") {
      Object.defineProperty(document, "startViewTransition", {
        value: undefined,
      });
      return;
    }
    if (mode === "untyped") {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (property: string, value?: string) => {
        if (property.includes(":active-view-transition-type(")) {
          return false;
        }
        return value === undefined
          ? supports(property)
          : supports(property, value);
      };
    }
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (options) => {
      const root = document.documentElement;
      const count = Number(root.dataset["transitionCount"] ?? 0) + 1;
      root.dataset["transitionCount"] = String(count);
      const transition = start(options);
      transition.ready
        .then(() => {
          root.dataset["transitionAnimations"] = JSON.stringify(
            document
              .getAnimations()
              .flatMap((animation) =>
                animation.effect instanceof KeyframeEffect
                  ? [animation.effect.pseudoElement]
                  : []
              )
          );
        })
        .catch((error: unknown) => {
          root.dataset["transitionError"] = String(error);
        });
      transition.finished
        .then(() => {
          root.dataset["transitionFinished"] = String(count);
        })
        .catch((error: unknown) => {
          root.dataset["transitionError"] = String(error);
        });
      return transition;
    };
  }, motion);
  await mockDataExplorerApp(page);
  await mockRpc(page, "MetricsService/QueryMetrics", { series: [] });
  await mockRpc(page, "DatabaseService/GetDatabaseQueryInsights", {
    queryInsights: {},
  });
  await mockRpc(page, "ExtensionService/ListExtensions", { extensions: [] });
  await mockRpc(page, "TableService/GetTablePartitionMetadata", {});
  await page.route("**.SQLService/ExecuteQuery", async (route) => {
    // Empty successful Connect stream: end-of-stream flag + JSON trailer.
    await route.fulfill({
      body: Buffer.from([2, 0, 0, 0, 2, 123, 125]),
      contentType: "application/connect+json",
    });
  });
  await page.goto("/instances/production/databases/appdb");
  await expect(
    page.getByRole("heading", { name: "appdb", exact: true })
  ).toBeVisible();
  expect(
    await page.locator("html").getAttribute("data-transition-count")
  ).toBeNull();

  return errors;
}
async function openExplorer(page: Page) {
  await page.getByRole("link", { name: "Data explorer", exact: true }).click();
  await expect(page).toHaveURL(EXPLORER_URL);
  await expect(
    page.getByRole("heading", { name: "public", exact: true })
  ).toBeVisible();
}
async function capturePage(page: Page, filename: string) {
  await expect(page).toHaveScreenshot(`${filename}.png`);
  await test.info().attach(filename, {
    body: await page.screenshot({
      animations: "disabled",
      caret: "hide",
      path: test.info().outputPath(`${filename}.png`),
    }),
    contentType: "image/png",
  });
}
async function goBack(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(DATABASE_URL);
  await expect(
    page.getByRole("heading", { name: "appdb", exact: true })
  ).toBeVisible();
}
async function goForward(page: Page) {
  await page.goForward();
  await expect(page).toHaveURL(EXPLORER_URL);
  await expect(
    page.getByRole("heading", { name: "public", exact: true })
  ).toBeVisible();
}

for (const motion of ["no-preference", "dark", "mobile"] as const) {
  test(`page navigation: ${motion}`, {
    tag: ["@feat:routing", "@flow:navigate"],
  }, async ({ page }) => {
    const errors = await openDatabase(page, motion);
    const prefix = motion === "no-preference" ? "" : `${motion}-`;
    await expect(
      page.getByRole("button", { name: "Search or jump to", exact: true })
    ).toBeVisible({ visible: motion !== "mobile" });
    await capturePage(page, `${prefix}database-page`);
    await openExplorer(page);
    await capturePage(page, `${prefix}explorer-page`);
    await expect
      .poll(() => page.locator("html").getAttribute("data-transition-count"))
      .toBe("1");
    await expect
      .poll(() => page.locator("html").getAttribute("data-transition-finished"))
      .toBe("1");
    const animations = await page
      .locator("html")
      .getAttribute("data-transition-animations");
    expect(animations).toContain("::view-transition-new(page-content)");
    expect(animations).not.toContain("(root)");
    await goBack(page);
    await expect
      .poll(() => page.locator("html").getAttribute("data-transition-finished"))
      .toBe("2");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await goForward(page);
    expect(
      await page.locator("html").getAttribute("data-transition-count")
    ).toBe("2");
    expect(
      await page.locator("html").getAttribute("data-transition-error")
    ).toBeNull();
    expect(errors).toEqual([]);
  });
}
for (const motion of ["reduce", "unsupported", "untyped"] as const) {
  test(`page navigation: ${motion}`, {
    tag: ["@feat:routing", "@flow:navigate"],
  }, async ({ page }) => {
    const errors = await openDatabase(page, motion);
    await openExplorer(page);
    expect(
      await page.locator("html").getAttribute("data-transition-count")
    ).toBeNull();
    await goBack(page);
    await goForward(page);
    expect(
      await page.locator("html").getAttribute("data-transition-count")
    ).toBeNull();
    expect(
      await page.locator("html").getAttribute("data-transition-error")
    ).toBeNull();
    expect(errors).toEqual([]);
  });
}
test("in-page table selection does not start a page transition", async ({
  page,
}) => {
  const errors = await openDatabase(page, "no-preference");
  await openExplorer(page);
  await expect
    .poll(() => page.locator("html").getAttribute("data-transition-finished"))
    .toBe("1");
  await page.getByPlaceholder("Filter…").fill("ord");
  await page.getByRole("button", { name: "orders 4 KB", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "public.orders", exact: true })
  ).toBeVisible();
  expect(await page.locator("html").getAttribute("data-transition-count")).toBe(
    "1"
  );
  expect(errors).toEqual([]);
});
