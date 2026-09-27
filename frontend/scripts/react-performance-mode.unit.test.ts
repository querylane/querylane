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
