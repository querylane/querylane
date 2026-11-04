import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release } from "node:os";
import path from "node:path";
import process from "node:process";
import { type Browser, chromium, type Page } from "playwright/test";
import { z } from "zod";
import { REACT_PROFILE_JOURNEYS } from "../e2e/react-performance/journeys";
import { shouldGuardApiRequest } from "../src/test/api-request-policy";
import {
  compareReactProfiles,
  type ReactProfileBuild,
  type ReactProfileEnvironment,
  type ReactProfileReport,
  reactProfileBuildSchema,
} from "./react-profile-comparison";
import { profileSeries } from "./react-profile-sequence";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAIRS = 5;
const PLAYWRIGHT_BASE_URL_KEY = "baseURL";
const VIEWPORT = { width: 1280, height: 900 };
const protocol = "react-profile-v1";
const manifestSchema = z.strictObject({
  base: reactProfileBuildSchema.optional(),
  head: reactProfileBuildSchema,
  machine: z.string().min(1),
  configDigest: z.string().regex(/^[a-f\d]{64}$/u),
});
const FIXTURE_FILES = [
  "e2e/tests/data-explorer-fixtures.ts",
  "e2e/tests/helpers.ts",
  "e2e/visual/console-resource-fixtures.ts",
  "e2e/visual/serve-service.ts",
  "src/test/fixtures/console-resource-fixtures.ts",
  "src/test/fixtures/sql-workbench-fixtures.ts",
];
function digest(files: string[]) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(path.join(ROOT, file)));
  }
  return hash.digest("hex");
}
function save(directory: string, name: string, value: unknown) {
  writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2));
}
function requireLoopback(build: ReactProfileBuild) {
  const url = new URL(build.url);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Profile builds must be explicitly served on local HTTP loopback"
    );
  }
}
async function guardNetwork(page: Page, origin: string) {
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    failures.push(error.message);
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const api = shouldGuardApiRequest({
      apiBaseUrl: "http://localhost:8080",
      headers: request.headers(),
      method: request.method(),
      url: request.url(),
    });
    if (api || url.origin !== origin) {
      failures.push(
        `Unmocked or external request ${url.origin}${url.pathname}`
      );
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return () => {
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "React journey network or application errors"
      );
    }
  };
}
async function collectBuild(
  browser: Browser,
  build: ReactProfileBuild,
  configDigest: string
) {
  requireLoopback(build);
  const context = await browser.newContext({
    [PLAYWRIGHT_BASE_URL_KEY]: build.url,
    viewport: VIEWPORT,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    return await profileSeries(REACT_PROFILE_JOURNEYS, async (journey) => {
      const page = await context.newPage();
      try {
        const assertHealthy = await guardNetwork(
          page,
          new URL(build.url).origin
        );
        await journey.setup(page);
        await journey.prepare(page);
        await page.evaluate(
          (expected) => {
            const identity = globalThis.window.querylaneReactProfileBuild;
            if (
              !identity ||
              identity.revision !== expected.revision ||
              identity.sourceDigest !== expected.sourceDigest ||
              identity.configDigest !== expected.configDigest
            ) {
              throw new Error(
                "Served profiling artifact identity does not match manifest"
              );
            }
          },
          {
            revision: build.revision,
            sourceDigest: build.sourceDigest,
            configDigest,
          }
        );
        await journey.act(page);
        await journey.prepare(page);
        await page.evaluate((id) => {
          if (!globalThis.window.querylaneReactProfile) {
            throw new Error("Missing profiling-only runtime recorder");
          }
          globalThis.window.querylaneReactProfile.begin(id);
        }, journey.id);
        await journey.act(page);
        const commits = await page.evaluate((id) => {
          if (!globalThis.window.querylaneReactProfile) {
            throw new Error("Missing profiling-only runtime recorder");
          }
          return globalThis.window.querylaneReactProfile.finish(id);
        }, journey.id);
        assertHealthy();
        return {
          id: journey.id,
          warmups: 1,
          success: true,
          commits,
        } satisfies ReactProfileReport["journeys"][number];
      } finally {
        await page.close();
      }
    });
  } finally {
    await context.close();
  }
}
async function collect(manifestPath: string, directory: string) {
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, "utf8"))
  );
  if (!manifest.base) {
    save(directory, "comparison.json", {
      status: "baseline-unavailable",
      reason:
        "No identified instrumented baseline supplied; no regression verdict",
    });
    return 2;
  }
  const browser = await chromium.launch();
  try {
    const environment: ReactProfileEnvironment = {
      machine: manifest.machine,
      platform: `${process.platform}/${process.arch}/${release()}/${cpus()[0]?.model ?? "unknown-cpu"}`,
      browser: `chromium/${browser.version()}`,
      toolchain: `${process.version}/${process.versions["bun"] ?? "node"}/${digest(["bun.lock", "package.json"])}`,
      configDigest: manifest.configDigest,
      fixtureDigest: digest(FIXTURE_FILES),
      journeyDigest: digest([
        "e2e/react-performance/journeys.ts",
        "scripts/react-profile.ts",
      ]),
    };
    const pairs = await profileSeries(
      Array.from({ length: PAIRS }, (_, pair) => pair),
      async (pair) => {
        const order: ["base" | "head", "base" | "head"] =
          pair % 2 === 0 ? ["base", "head"] : ["head", "base"];
        return await profileSeries(order, async (side) => {
          const build = manifest[side];
          if (!build) {
            throw new Error("Missing baseline");
          }
          const report: ReactProfileReport = {
            schema: 1,
            side,
            pair,
            order,
            protocol,
            environment,
            build,
            journeys: await collectBuild(browser, build, manifest.configDigest),
          };
          save(directory, `pair-${pair}-${side}.json`, report);
          return report;
        });
      }
    );
    const reports = pairs.flat();
    const result = compareReactProfiles(
      reports,
      REACT_PROFILE_JOURNEYS.map((journey) => journey.id)
    );
    save(directory, "comparison.json", result);
    if (result.status === "inconclusive") {
      return 2;
    }
    return result.status === "regression" ? 1 : 0;
  } finally {
    await browser.close();
  }
}
async function main(args: string[]) {
  const [command, input, directory] = args;
  if (
    input === undefined ||
    input.length === 0 ||
    directory === undefined ||
    directory.length === 0 ||
    !path.isAbsolute(directory) ||
    directory.startsWith(ROOT)
  ) {
    throw new Error(
      "Usage: bun scripts/react-profile.ts collect|compare input.json /absolute/isolated/output"
    );
  }
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).length > 0) {
    throw new Error(
      "Profile evidence output must be empty to prevent stale receipts"
    );
  }
  if (command === "collect") {
    return await collect(input, directory);
  }
  if (command === "compare") {
    const result = compareReactProfiles(
      JSON.parse(readFileSync(input, "utf8")),
      REACT_PROFILE_JOURNEYS.map((journey) => journey.id)
    );
    save(directory, "comparison.json", result);
    if (result.status === "inconclusive") {
      return 2;
    }
    return result.status === "regression" ? 1 : 0;
  }
  throw new Error("Expected collect or compare");
}
if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
