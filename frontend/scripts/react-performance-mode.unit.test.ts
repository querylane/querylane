import { describe, expect, test } from "@rstest/core";
import { resolveReactPerformanceMode } from "./react-performance-mode";

describe("resolveReactPerformanceMode", () => {
  test("keeps native React as the default renderer", () => {
    const mode = resolveReactPerformanceMode({ env: {}, isProduction: true });
    expect(mode.renderer).toBe("react");
    expect(mode.aliases).not.toHaveProperty("react$");
  });

  test("selects Redact explicitly and isolates its build cache", () => {
    const native = resolveReactPerformanceMode({ env: {}, isProduction: true });
    const redact = resolveReactPerformanceMode({
      env: { QUERYLANE_RENDERER: "redact" },
      isProduction: true,
    });
    expect(redact).toMatchObject({ renderer: "redact" });
    expect(redact.buildCacheKey).not.toBe(native.buildCacheKey);
  });

  test("rejects unsupported renderers rather than silently building React", () => {
    expect(() =>
      resolveReactPerformanceMode({
        env: { QUERYLANE_RENDERER: "typo" },
        isProduction: true,
      })
    ).toThrow('QUERYLANE_RENDERER must be "react" or "redact"');
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
