import { describe, expect, test } from "vitest";
import {
  getDefaultPreload,
  getDefaultPreloadStaleTime,
} from "@/lib/router-options";

describe("router options", () => {
  test("preloads route data on user intent", () => {
    expect(getDefaultPreload()).toBe("intent");
  });

  test("lets query stale times decide whether intent preloads refetch", () => {
    expect(getDefaultPreloadStaleTime()).toBe(0);
  });
});
