import { afterEach, describe, expect, rs, test } from "@rstest/core";
import {
  canPreloadRouteCode,
  getDefaultPreload,
  getDefaultPreloadStaleTime,
} from "@/lib/router-options";

afterEach(() => {
  rs.unstubAllGlobals();
});

describe("router options", () => {
  test("disables Router data preloading, including active parent loaders", () => {
    expect(getDefaultPreload()).toBe(false);
  });
  test("preloads route code on user intent when network hints are absent", () => {
    rs.stubGlobal("navigator", { onLine: true });
    expect(canPreloadRouteCode()).toBe(true);
  });

  test.each([
    { effectiveType: "4g", saveData: true },
    { effectiveType: "slow-2g", saveData: false },
    { effectiveType: "2g", saveData: false },
    { effectiveType: "3g", saveData: false },
  ])("disables preloading for a constrained connection: %j", (connection) => {
    rs.stubGlobal("navigator", { connection, onLine: true });
    expect(canPreloadRouteCode()).toBe(false);
  });

  test("disables preloading offline", () => {
    rs.stubGlobal("navigator", { onLine: false });
    expect(canPreloadRouteCode()).toBe(false);
  });

  test("enables intent preloading on an unconstrained connection", () => {
    rs.stubGlobal("navigator", {
      connection: { effectiveType: "4g", saveData: false },
      onLine: true,
    });
    expect(canPreloadRouteCode()).toBe(true);
  });

  test("lets Query own freshness when navigating after a code-only preload", () => {
    expect(getDefaultPreloadStaleTime()).toBe(0);
  });
});
