import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { createRsbuild } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { chromium, expect, type Page } from "playwright/test";
import { normalReactOutputContract } from "./react-performance-mode";
import {
  compareReactProfiles,
  type ReactProfileReport,
} from "./react-profile-comparison";
import { profileSeries } from "./react-profile-sequence";

const ROOT = path.resolve(import.meta.dirname, "..");
const FORBIDDEN = 403;
const SERVER_ERROR = 500;
const BASE_WORK = 1_000_000;
const HEAD_WORK = 20_000_000;
const SHA_LENGTH = 40;
const DIGEST_LENGTH = 64;
const PAIRS = 5;
const OUTLIER_PAIR = 2;
const CONTROL_ID = "seeded-work:v1";

async function controlServer(directory: string, profiling: boolean) {
  const builder = await createRsbuild({
    cwd: ROOT,
    rsbuildConfig: {
      mode: "production",
      source: {
        entry: { index: "./src/lib/react-profile-runtime-control.tsx" },
      },
      output: { distPath: { root: directory }, cleanDistPath: false },
      html: { template: path.join(ROOT, "index.html") },
      performance: { buildCache: false, printFileSize: false },
      plugins: [
        pluginReact({
          enableProfiler: profiling,
          reactCompiler: {
            compilationMode: "infer",
            target: "19",
            panicThreshold: "none",
          },
        }),
      ],
    },
  });
  await builder.build();
  const server = createServer((request, response) => {
    try {
      const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");
      const file = path.resolve(
        directory,
        `.${pathname === "/" ? "/index.html" : pathname}`
      );
      if (!file.startsWith(`${directory}/`)) {
        response.writeHead(FORBIDDEN).end();
        return;
      }
      response.setHeader(
        "Content-Type",
        file.endsWith(".js") ? "text/javascript" : "text/html"
      );
      response.end(readFileSync(file));
    } catch (error) {
      response.writeHead(SERVER_ERROR).end(String(error));
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Runtime control did not bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  };
}
async function render(page: Page, units: number) {
  const sequence = await page.evaluate((amount) => {
    if (!globalThis.window.querylaneProfileControl) {
      throw new Error("Missing runtime control");
    }
    return globalThis.window.querylaneProfileControl.render(amount);
  }, units);
  await expect(page.locator("output")).toHaveAttribute(
    "data-sequence",
    String(sequence)
  );
}
async function collect(page: Page, units: number) {
  await page.evaluate((id) => {
    if (!globalThis.window.querylaneReactProfile) {
      throw new Error("Missing recorder");
    }
    globalThis.window.querylaneReactProfile.begin(id);
  }, CONTROL_ID);
  await render(page, units);
  return await page.evaluate((id) => {
    if (!globalThis.window.querylaneReactProfile) {
      throw new Error("Missing recorder");
    }
    return globalThis.window.querylaneReactProfile.finish(id);
  }, CONTROL_ID);
}
async function sample(input: {
  page: Page;
  pair: number;
  side: "base" | "head";
  order: ["base" | "head", "base" | "head"];
  version: string;
  url: string;
  sustained: boolean;
}): Promise<ReactProfileReport> {
  const { page, pair, side, order, version, url, sustained } = input;
  const units =
    side === "head" && (sustained || pair === OUTLIER_PAIR)
      ? HEAD_WORK
      : BASE_WORK;
  return {
    schema: 1,
    pair,
    order,
    side,
    protocol: "react-profile-v1",
    environment: {
      machine: "synthetic-control",
      platform: process.platform,
      browser: version,
      toolchain: "installed",
      fixtureDigest: "1".repeat(DIGEST_LENGTH),
      configDigest: "2".repeat(DIGEST_LENGTH),
      journeyDigest: "3".repeat(DIGEST_LENGTH),
    },
    build: {
      revision: (side === "base" ? "a" : "b").repeat(SHA_LENGTH),
      sourceDigest: (side === "base" ? "c" : "d").repeat(DIGEST_LENGTH),
      artifactDigest: (side === "base" ? "e" : "f").repeat(DIGEST_LENGTH),
      url,
      mode: "react-profile",
    },
    journeys: [
      {
        id: CONTROL_ID,
        warmups: 1,
        success: true,
        commits: await collect(page, units),
      },
    ],
  };
}
async function verifyControls(input: {
  page: Page;
  normal: string;
  profiled: string;
  version: string;
  directory: string;
}) {
  const { page, normal, profiled, version, directory } = input;
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    failures.push(error.message);
  });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") {
      return route.continue();
    }
    failures.push(
      `Unexpected external control request ${route.request().url()}`
    );
    return route.abort("blockedbyclient");
  });
  await page.goto(normal);
  await expect(page.locator("output")).toBeVisible();
  await expect(collect(page, BASE_WORK)).rejects.toThrow(
    "No nonzero React profiling callbacks"
  );
  await page.goto(profiled);
  await expect(page.locator("output")).toBeVisible();
  await render(page, BASE_WORK);
  await render(page, HEAD_WORK);
  await verifyPattern({ page, profiled, version, directory, sustained: true });
  await verifyPattern({ page, profiled, version, directory, sustained: false });
  expect(failures).toEqual([]);
}
async function verifyPattern(input: {
  page: Page;
  profiled: string;
  version: string;
  directory: string;
  sustained: boolean;
}) {
  const { page, profiled, version, directory, sustained } = input;
  const paired = await profileSeries(
    Array.from({ length: PAIRS }, (_, pair) => pair),
    async (pair) => {
      const order: ["base" | "head", "base" | "head"] =
        pair % 2 === 0 ? ["base", "head"] : ["head", "base"];
      return await profileSeries(order, (side) =>
        sample({ page, pair, side, order, version, url: profiled, sustained })
      );
    }
  );
  const result = compareReactProfiles(paired.flat(), [CONTROL_ID]);
  const pattern = sustained ? "sustained" : "outlier";
  writeFileSync(
    path.join(directory, `${pattern}-runtime-control.json`),
    JSON.stringify(
      {
        purpose:
          "Synthetic runtime capability control; identifiers are synthetic, not app revisions",
        normalRuntimeRejected: true,
        result,
      },
      null,
      2
    )
  );
  expect(result.status).toBe(sustained ? "regression" : "inconclusive");
}

async function withBrowser(input: {
  normal: string;
  profiled: string;
  directory: string;
}) {
  const browser = await chromium.launch();
  try {
    await verifyControls({
      ...input,
      page: await browser.newPage(),
      version: browser.version(),
    });
  } finally {
    await browser.close();
  }
}
async function checkNormalGraph(entry: string, directory: string) {
  const builder = await createRsbuild({
    cwd: ROOT,
    rsbuildConfig: {
      mode: "production",
      logLevel: "silent",
      source: { entry: { index: entry } },
      output: { distPath: { root: directory }, cleanDistPath: false },
      performance: { buildCache: false, printFileSize: false },
      plugins: [pluginReact()],
      tools: {
        rspack(config) {
          config.plugins ??= [];
          config.plugins.push(normalReactOutputContract);
        },
      },
    },
  });
  await builder.build();
}
async function verifyNormalOutputContract(directory: string) {
  await checkNormalGraph(
    "./src/lib/render-root.tsx",
    path.join(directory, "normal-contract-valid")
  );
  await expect(
    checkNormalGraph(
      "./src/lib/react-profile-root.tsx",
      path.join(directory, "normal-contract-seeded-bad")
    )
  ).rejects.toThrow("Diagnostic React module in normal output");
}
/** Capability/negative controls only: not an app journey or revision comparison. */
async function verifyReactProfileRuntime(directory: string) {
  if (!path.isAbsolute(directory) || directory.startsWith(ROOT)) {
    throw new Error("Control artifacts require an isolated absolute directory");
  }
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).length > 0) {
    throw new Error(
      "Profile evidence output must be empty to prevent stale receipts"
    );
  }
  await verifyNormalOutputContract(directory);
  const profiled = await controlServer(path.join(directory, "profile"), true);
  try {
    const normal = await controlServer(path.join(directory, "normal"), false);
    try {
      await withBrowser({
        normal: normal.url,
        profiled: profiled.url,
        directory,
      });
    } finally {
      await normal.close();
    }
  } finally {
    await profiled.close();
  }
}
if (import.meta.main) {
  const [directory] = process.argv.slice(2);
  if (directory === undefined || directory.length === 0) {
    throw new Error(
      "Usage: bun scripts/verify-react-profile-runtime.ts /absolute/isolated/output"
    );
  }
  await verifyReactProfileRuntime(directory);
}
