import { expect, test } from "./base";
import { mockDataExplorerApp } from "./data-explorer-fixtures";
import { mockRpc } from "./helpers";

const EXPLORER_URL = /\/instances\/production\/databases\/appdb\/explorer/;
const DATABASE_URL = /\/instances\/production\/databases\/appdb\/?$/;

for (const motion of [
  "no-preference",
  "reduce",
  "unsupported",
  "untyped",
  "dark",
  "mobile",
] as const) {
  test(`page navigation: ${motion}`, {
    tag: ["@feat:routing", "@flow:navigate"],
  }, async ({ page }) => {
    const errors: string[] = [];
    const animated = ["no-preference", "dark", "mobile"].includes(motion);
    const screenshotPrefix = motion === "no-preference" ? "" : `${motion}-`;
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
        transition.ready.then(
          () => {
            root.dataset["transitionAnimations"] = JSON.stringify(
              document
                .getAnimations()
                .flatMap((animation) =>
                  animation.effect instanceof KeyframeEffect
                    ? [animation.effect.pseudoElement]
                    : []
                )
            );
          },
          (error: unknown) => {
            root.dataset["transitionError"] = String(error);
          }
        );
        transition.finished.then(
          () => {
            root.dataset["transitionFinished"] = String(count);
          },
          (error: unknown) => {
            root.dataset["transitionError"] = String(error);
          }
        );
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
    if (animated) {
      if (motion !== "mobile") {
        await expect(
          page.getByRole("button", { name: "Search or jump to", exact: true })
        ).toBeVisible();
      }
      await expect(page).toHaveScreenshot(
        `${screenshotPrefix}database-page.png`
      );
      await test.info().attach(`${screenshotPrefix}database-page`, {
        body: await page.screenshot({
          animations: "disabled",
          caret: "hide",
          path: test.info().outputPath(`${screenshotPrefix}database-page.png`),
        }),
        contentType: "image/png",
      });
    }

    await page
      .getByRole("link", { name: "Data explorer", exact: true })
      .click();
    await expect(page).toHaveURL(EXPLORER_URL);
    await expect(
      page.getByRole("heading", { name: "public", exact: true })
    ).toBeVisible();
    if (animated) {
      await expect(page).toHaveScreenshot(
        `${screenshotPrefix}explorer-page.png`
      );
      await test.info().attach(`${screenshotPrefix}explorer-page`, {
        body: await page.screenshot({
          animations: "disabled",
          caret: "hide",
          path: test.info().outputPath(`${screenshotPrefix}explorer-page.png`),
        }),
        contentType: "image/png",
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number(document.documentElement.dataset["transitionCount"] ?? 0)
          )
        )
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.dataset["transitionFinished"]
          )
        )
        .toBe("1");
      const animations = await page
        .locator("html")
        .getAttribute("data-transition-animations");
      expect(animations).toContain("::view-transition-new(page-content)");
      expect(animations).not.toContain("(root)");
    } else {
      expect(
        await page.evaluate(() =>
          Number(document.documentElement.dataset["transitionCount"] ?? 0)
        )
      ).toBe(0);
    }

    await page.goBack();
    await expect(page).toHaveURL(DATABASE_URL);
    await expect(
      page.getByRole("heading", { name: "appdb", exact: true })
    ).toBeVisible();
    if (animated) {
      await expect
        .poll(() =>
          page.locator("html").getAttribute("data-transition-finished")
        )
        .toBe("2");
      // Respect preference changes without requiring an app reload.
      await page.emulateMedia({ reducedMotion: "reduce" });
    }
    await page.goForward();
    await expect(page).toHaveURL(EXPLORER_URL);
    await expect(
      page.getByRole("heading", { name: "public", exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        Number(document.documentElement.dataset["transitionCount"] ?? 0)
      )
    ).toBe(animated ? 2 : 0);
    if (motion === "no-preference") {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByPlaceholder("Filter…").fill("ord");
      await page
        .getByRole("button", { name: "orders 4 KB", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "public.orders", exact: true })
      ).toBeVisible();
      expect(
        await page.locator("html").getAttribute("data-transition-count")
      ).toBe("2");
    }
    expect(
      await page.locator("html").getAttribute("data-transition-error")
    ).toBeNull();
    expect(errors).toEqual([]);
  });
}
