import path from "node:path";
import { createRsbuild, loadConfig } from "@rsbuild/core";
import type { Page, TestInfo } from "playwright/test";
import { e2eEnv } from "../env";
import {
  REACT_PROFILE_JOURNEYS,
  type ReactProfileJourney,
} from "../react-performance/journeys";
import { expect, test } from "./base";

const profiling = e2eEnv.QUERYLANE_REACT_PROFILE === "1";
const mode = profiling ? "profiling production" : "ordinary production";
const FRONTEND = path.resolve(import.meta.dirname, "../..");

test(`${mode}: composed resolver keeps tsconfig priority and UI source`, async () => {
  const { content } = await loadConfig({ cwd: FRONTEND });
  const builder = await createRsbuild({
    cwd: FRONTEND,
    rsbuildConfig: { ...content, mode: "production" },
  });
  const compiler = await builder.createCompiler();
  try {
    if ("compilers" in compiler) {
      throw new Error("Expected one application compiler");
    }
    const resolver = compiler.resolverFactory.get("normal", {
      ...compiler.options.resolve,
      dependencyType: "esm",
    });
    expect(compiler.options.resolve.tsConfig).toMatchObject({
      configFile: path.join(FRONTEND, "tsconfig.json"),
    });
    expect(resolver.resolveSync({}, FRONTEND, "@/components/ui/button")).toBe(
      path.join(FRONTEND, "src/components/ui/button.tsx")
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      compiler.close((error) => {
        if (error === undefined || error === null) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }
});

async function verifyProfile(
  page: Page,
  journey: ReactProfileJourney,
  testInfo: TestInfo
) {
  expect(
    await page.evaluate(() => globalThis.window.querylaneReactProfileBuild)
  ).toEqual({
    revision: e2eEnv.QUERYLANE_REACT_PROFILE_REVISION,
    sourceDigest: e2eEnv.QUERYLANE_REACT_PROFILE_SOURCE_DIGEST,
    configDigest: e2eEnv.QUERYLANE_REACT_PROFILE_CONFIG_DIGEST,
  });
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
  expect(commits.length).toBeGreaterThan(0);
  expect(
    commits.reduce((sum, commit) => sum + commit.actualDuration, 0)
  ).toBeGreaterThan(0);
  await testInfo.attach("application-react-commits", {
    body: JSON.stringify(commits),
    contentType: "application/json",
  });
}
async function verifyNormal(page: Page, journey: ReactProfileJourney) {
  await journey.act(page);
  expect(
    await page.evaluate(() => ({
      recorder: globalThis.window.querylaneReactProfile,
      build: globalThis.window.querylaneReactProfileBuild,
      control: globalThis.window.querylaneProfileControl,
    }))
  ).toEqual({ recorder: undefined, build: undefined, control: undefined });
}
const verifyRecording = profiling ? verifyProfile : verifyNormal;

for (const journey of REACT_PROFILE_JOURNEYS) {
  test(`${mode}: application records only when opted in — ${journey.id}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => {
      failures.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        failures.push(message.text());
      }
    });
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== baseURL) {
        failures.push(`Unexpected external request ${route.request().url()}`);
        return route.abort("blockedbyclient");
      }
      return route.fallback();
    });
    await journey.setup(page);
    await journey.prepare(page);
    await verifyRecording(page, journey, testInfo);
    expect(failures).toEqual([]);
  });
}
