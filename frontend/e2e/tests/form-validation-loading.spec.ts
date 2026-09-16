import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { expect, test } from "./base";
import {
  mockApiManagedReadyConsole,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockReadyOnboarding,
  sampleInstance,
} from "./helpers";

const sourceMapSchema = z.object({ sources: z.array(z.string()) });
const validationModulePattern =
  /node_modules\/(?:@bufbuild\/(?:protovalidate|cel|cel-spec)|react-hook-form)\//;
const distDirectory = join(import.meta.dirname, "../../dist");

function downloadedSources(scriptPaths: Set<string>) {
  return [...scriptPaths].flatMap((path) => {
    // Inspect the emitted assets actually requested by the browser, not chunk
    // names or config text. Missing maps fail instead of hiding a regression.
    const sourceMap: unknown = JSON.parse(
      readFileSync(join(distDirectory, `${path}.map`), "utf8")
    );
    return sourceMapSchema.parse(sourceMap).sources;
  });
}

test("instance overview defers form validation until configuration opens", {
  tag: ["@perf", "@feat:instances"],
}, async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
  const instance = {
    ...sampleInstance,
    connectionError: "authentication failed",
    connectionState: "CONNECTION_STATE_ERROR",
  };
  await mockReadyOnboarding(page);
  await mockApiManagedReadyConsole(page);
  await mockInstanceCatalog(page, [instance]);
  await mockInstanceDetails(page, instance);
  await mockDatabases(page, []);

  const scripts = new Set<string>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (request.resourceType() === "script" && pathname.endsWith(".js")) {
      scripts.add(pathname.slice(1));
    }
  });

  await page.goto("/instances/production");
  await expect(page.getByText("Databases unavailable")).toBeVisible();
  const overviewSources = downloadedSources(scripts);
  expect(
    overviewSources.some((source) => source.includes("@connectrpc/"))
  ).toBe(true);
  expect(
    overviewSources.filter((source) => validationModulePattern.test(source))
  ).toEqual([]);

  const validationDownload = Promise.withResolvers<void>();
  await page.route("**/form-validation.*.js", async (route) => {
    await validationDownload.promise;
    await route.continue();
  });
  await page.getByRole("link", { name: "Configuration", exact: true }).click();
  try {
    await expect(page.getByText("Loading configuration…")).toBeVisible();
    await expect(page).toHaveScreenshot("configuration-loading.png");
  } finally {
    validationDownload.resolve();
  }
  await expect(
    page.getByRole("button", { name: "Save changes" })
  ).toBeVisible();
  expect(
    downloadedSources(scripts).some((source) =>
      source.includes("@bufbuild/protovalidate/")
    )
  ).toBe(true);

  await page.getByLabel("Host", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Host is required.")).toBeVisible();
  await expect(page).toHaveScreenshot("configuration-validation.png");
  expect(errors).toEqual([]);
});
