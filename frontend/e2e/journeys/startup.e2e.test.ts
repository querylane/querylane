import type { Page } from "playwright/test";
import { expect, test } from "./browser.test-utils";
import { mockReadyEmptyApp } from "./querylane-rpc.fixture";

const SCRIPT_CSP = "script-src 'self'; object-src 'none'; base-uri 'self'";
const PRIMARY_FONT = /\/sans-core\.[\w]+\.woff2$/u;

async function holdReact(page: Page) {
  const gate = Promise.withResolvers<void>();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("#root")) {
        document.documentElement.dataset["themeAtBody"] =
          document.documentElement.className;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() === "document") {
      const response = await route.fetch();
      await route.fulfill({
        headers: {
          ...response.headers(),
          "content-security-policy": SCRIPT_CSP,
        },
        response,
      });
      return;
    }
    if (
      request.resourceType() === "script" &&
      new URL(request.url()).pathname !== "/theme-init.js"
    ) {
      await gate.promise;
    }
    await route.fallback();
  });
  return { errors, release: gate.resolve };
}

test("startup preloads the primary font and retains the saved theme after React mounts", async ({
  page,
}) => {
  await mockReadyEmptyApp(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("querylane-ui-theme", "dark");
  });
  const startup = await holdReact(page);
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByRole("status")).toHaveText("Loading Querylane…");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-at-body",
      "dark"
    );
    const preloads = page.locator('link[rel="preload"]');
    await expect(preloads).toHaveCount(1);
    await expect(preloads).toHaveAttribute("as", "font");
    await expect(preloads).toHaveAttribute("href", PRIMARY_FONT);
    await expect(preloads).toHaveAttribute("crossorigin", "");
    await page.evaluate(() => document.fonts.ready);
    const href = await preloads.getAttribute("href");
    const fontRequests = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.endsWith(".woff2"))
    );
    expect(fontRequests).toEqual([new URL(href ?? "", page.url()).href]);
  } finally {
    startup.release();
  }
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass("dark");
  expect(startup.errors).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("startup explains how to continue", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await expect(page.locator("noscript")).toHaveText(
      "Enable JavaScript and reload to use Querylane.",
      { useInnerText: true }
    );
    await expect(page.locator("noscript")).toBeVisible();
    await expect(page.getByRole("status")).toBeHidden();
  });
});
