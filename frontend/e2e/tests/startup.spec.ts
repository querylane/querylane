import type { Page } from "playwright/test";
import { expect, test } from "./base";
import { mockReadyEmptyApp } from "./helpers";

const SCRIPT_CSP = "script-src 'self'; object-src 'none'; base-uri 'self'";
const PRIMARY_FONT = /\/geist-latin-wght-normal\.[\w]+\.woff2$/;

// Exercise the emitted HTML before any React bundle can execute. A latch,
// rather than a timed delay, also lets the same page prove the React handoff.
async function holdReact(page: Page) {
  const gate = Promise.withResolvers<void>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.getElementById("root")) {
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

for (const viewport of [
  { height: 900, name: "desktop", width: 1280 },
  { height: 844, name: "mobile", width: 390 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`startup: saved ${theme}, ${viewport.name}, CSP and React handoff`, async ({
      page,
      makeAxeBuilder,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        colorScheme: theme === "dark" ? "light" : "dark",
      });
      await page.addInitScript((savedTheme) => {
        localStorage.setItem("querylane-ui-theme", savedTheme);
      }, theme);
      await mockReadyEmptyApp(page);
      const startup = await holdReact(page);
      try {
        await page.goto("/", { waitUntil: "commit" });
        const status = page.getByRole("status");
        await expect(status).toHaveText("Loading Querylane…");
        await expect(status).toBeVisible();
        const logo = status.locator("img:visible");
        await expect(logo).toHaveCount(1);
        await expect(logo).toHaveAttribute("src", `/icon-${theme}.svg`);
        await expect(logo).toHaveJSProperty("complete", true);
        await expect(logo).toHaveJSProperty("naturalWidth", 32);
        await expect(status.locator("span")).toHaveClass("sr-only");
        const bounds = await logo.boundingBox();
        expect(bounds).toEqual({
          height: 40,
          width: 40,
          x: (viewport.width - 40) / 2,
          y: (viewport.height - 40) / 2,
        });
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme-at-body",
          theme
        );
        await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
        await expect(status).toHaveCSS(
          "font-family",
          '"Geist Variable", sans-serif'
        );
        await expect(page).toHaveScreenshot(`${theme}-${viewport.name}.png`, {
          clip: {
            x: (viewport.width - 160) / 2,
            y: (viewport.height - 160) / 2,
            width: 160,
            height: 160,
          },
          maxDiffPixels: 0,
        });
        expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
      } finally {
        startup.release();
      }
      await expect(
        page.getByRole("status").filter({ hasText: "Loading Querylane…" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Postgres server to manage",
          exact: true,
        })
      ).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme);
      expect(startup.errors).toEqual([]);
    });
  }
}

for (const scenario of [
  { name: "system dark", stored: "system", system: "dark", expected: "dark" },
  {
    name: "system light",
    stored: "system",
    system: "light",
    expected: "light",
  },
  {
    name: "missing preference",
    stored: null,
    system: "dark",
    expected: "dark",
  },
  {
    name: "invalid preference",
    stored: "sepia",
    system: "dark",
    expected: "dark",
  },
  { name: "blocked storage", stored: null, system: "dark", expected: "dark" },
] as const) {
  test(`startup: ${scenario.name} keeps the same theme after mount`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scenario.system });
    await page.addInitScript(({ name, stored }) => {
      if (stored !== null) {
        localStorage.setItem("querylane-ui-theme", stored);
      }
      if (name === "blocked storage") {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage blocked", "SecurityError");
          },
        });
      }
    }, scenario);
    await mockReadyEmptyApp(page);
    const startup = await holdReact(page);
    try {
      await page.goto("/", { waitUntil: "commit" });
      await expect(page.getByRole("status")).toHaveText("Loading Querylane…");
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme-at-body",
        scenario.expected
      );
    } finally {
      startup.release();
    }
    await expect(
      page.getByRole("heading", {
        name: "Postgres server to manage",
        exact: true,
      })
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(scenario.expected);
    expect(startup.errors).toEqual([]);
  });
}

test("startup falls back to light without matchMedia", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", { value: undefined });
  });
  // Only the pre-React fallback supports this environment; third-party UI
  // code requires matchMedia. Do not run that unrelated code in this test.
  await page.route("**/static/js/**", (route) =>
    route.fulfill({ body: "", contentType: "application/javascript" })
  );
  const startup = await holdReact(page);
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByRole("status")).toHaveText("Loading Querylane…");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-at-body",
      "light"
    );
    expect(startup.errors).toEqual([]);
  } finally {
    startup.release();
  }
});

test("startup preloads only the primary font and consumes the same URL", async ({
  page,
}) => {
  await mockReadyEmptyApp(page);
  const startup = await holdReact(page);
  try {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByRole("status")).toBeVisible();
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
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("startup explains how to continue", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    // Playwright's text engine excludes noscript subtrees even when scripting
    // is disabled, so address this native fallback element directly.
    await expect(page.locator("noscript")).toHaveText(
      "Enable JavaScript and reload to use Querylane.",
      { useInnerText: true }
    );
    await expect(page.locator("noscript")).toBeVisible();
    await expect(page.getByRole("status")).toBeHidden();
    await expect(page).toHaveScreenshot("no-javascript-desktop.png", {
      clip: { x: 440, y: 390, width: 400, height: 120 },
      maxDiffPixels: 0,
    });
  });
});
