import { describe, expect, test } from "vitest";
import { resolveReactPerformanceMode } from "./react-performance-mode";

describe("resolveReactPerformanceMode", () => {
  test("enables global infer compilation and disables React Scan by default", () => {
    expect(
      resolveReactPerformanceMode({ env: {}, isProduction: false })
    ).toEqual({
      buildCacheKey: "react-compiler-infer",
      compiler: {
        compilationMode: "infer",
        panicThreshold: "none",
        target: "19",
      },
      reactScanEnabled: false,
    });
  });

  test("uses annotation mode only for an explicit local control", () => {
    expect(
      resolveReactPerformanceMode({
        env: { QUERYLANE_REACT_COMPILER_MODE: "annotation" },
        isProduction: false,
      }).compiler.compilationMode
    ).toBe("annotation");
  });

  test("isolates persistent build caches by compiler mode", () => {
    const infer = resolveReactPerformanceMode({ env: {}, isProduction: false });
    const annotation = resolveReactPerformanceMode({
      env: { QUERYLANE_REACT_COMPILER_MODE: "annotation" },
      isProduction: false,
    });

    expect(infer.buildCacheKey).not.toBe(annotation.buildCacheKey);
  });

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
