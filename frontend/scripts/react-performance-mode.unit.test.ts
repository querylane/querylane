import process from "node:process";
import { describe, expect, test } from "@rstest/core";
import { resolveReactPerformanceMode } from "./react-performance-mode";

describe("resolveReactPerformanceMode", () => {
  test("enables React Scan only when explicitly requested", () => {
    expect(
      resolveReactPerformanceMode({
        env: { QUERYLANE_REACT_SCAN: "1" },
        isProduction: false,
      })
    ).toMatchObject({ reactScanEnabled: true });
  });

  test("rejects React Scan in production builds", () => {
    expect(() =>
      resolveReactPerformanceMode({
        env: { QUERYLANE_REACT_SCAN: "1" },
        isProduction: true,
      })
    ).toThrow("React Scan is local-development tooling");
  });

  test("rejects unsupported compiler modes", () => {
    expect(() =>
      resolveReactPerformanceMode({
        env: { QUERYLANE_REACT_COMPILER_MODE: "all" },
        isProduction: false,
      })
    ).toThrow('QUERYLANE_REACT_COMPILER_MODE must be "annotation" or "infer"');
  });
});

test("profiling requires explicit production-only isolated output and cache", () => {
  const env = {
    QUERYLANE_REACT_PROFILE: "1",
    QUERYLANE_REACT_PROFILE_ROOT: "/tmp/q14-build",
    QUERYLANE_REACT_PROFILE_REVISION: "a".repeat(40),
    QUERYLANE_REACT_PROFILE_SOURCE_DIGEST: "b".repeat(64),
    QUERYLANE_REACT_PROFILE_CONFIG_DIGEST: "c".repeat(64),
  };
  expect(
    resolveReactPerformanceMode({ env, isProduction: true })
  ).toMatchObject({
    profile: {
      root: "/tmp/q14-build",
      output: "/tmp/q14-build/dist",
      cache: "/tmp/q14-build/cache",
    },
    buildCacheKey: "react-compiler-infer:react-profile-v1",
  });
  expect(() =>
    resolveReactPerformanceMode({
      env: { QUERYLANE_REACT_PROFILE: "1" },
      isProduction: true,
    })
  ).toThrow();
  expect(() =>
    resolveReactPerformanceMode({ env, isProduction: false })
  ).toThrow();
  expect(() =>
    resolveReactPerformanceMode({
      env: { ...env, QUERYLANE_VISUAL_HARNESS: "1" },
      isProduction: true,
    })
  ).toThrow();
  expect(() =>
    resolveReactPerformanceMode({
      env: { ...env, QUERYLANE_REACT_PROFILE_ROOT: process.cwd() },
      isProduction: true,
    })
  ).toThrow();
});

test("ordinary production keeps its compiler/cache mode and no profiler", () => {
  expect(
    resolveReactPerformanceMode({ env: {}, isProduction: true })
  ).toMatchObject({
    buildCacheKey: "react-compiler-infer",
    profile: undefined,
  });
});

test("profiling normalizes isolated roots and rejects disguised filesystem roots", () => {
  const env = {
    QUERYLANE_REACT_PROFILE: "1",
    QUERYLANE_REACT_PROFILE_ROOT: "/tmp/../",
    QUERYLANE_REACT_PROFILE_REVISION: "a".repeat(40),
    QUERYLANE_REACT_PROFILE_SOURCE_DIGEST: "b".repeat(64),
    QUERYLANE_REACT_PROFILE_CONFIG_DIGEST: "c".repeat(64),
  };
  expect(() =>
    resolveReactPerformanceMode({ env, isProduction: true })
  ).toThrow("absolute output root outside frontend");
  expect(
    resolveReactPerformanceMode({
      env: {
        ...env,
        QUERYLANE_REACT_PROFILE_ROOT: "/tmp/ignored/../q14-build",
      },
      isProduction: true,
    }).profile
  ).toMatchObject({
    root: "/tmp/q14-build",
    output: "/tmp/q14-build/dist",
    cache: "/tmp/q14-build/cache",
  });
});

test("normal output rejects seeded diagnostic modules without excluding regular React", async () => {
  const { assertNormalReactModules } = await import("./react-performance-mode");
  expect(() => {
    assertNormalReactModules([
      "/node_modules/react-dom/cjs/react-dom-client.production.js",
      "/src/lib/render-root.tsx",
    ]);
  }).not.toThrow();
  for (const module of [
    "/node_modules/react-dom/cjs/react-dom-profiling.profiling.js",
    "/src/lib/react-profile-root.tsx",
    "/src/lib/react-profile-recorder.ts",
    "/src/react-profile-main.tsx",
  ]) {
    expect(() => {
      assertNormalReactModules([module]);
    }).toThrow("Diagnostic React module");
  }
});
