import { describe, expect, test } from "@rstest/core";
import { buildResourceCollectionQueryState } from "@/lib/db-query-state";

describe("buildResourceCollectionQueryState", () => {
  describe("when disabled (query suppressed)", () => {
    test("forces error=null and isFetching=false even when caller passes truthy values", () => {
      const state = buildResourceCollectionQueryState({
        enabled: false,
        error: new Error("something"),
        isFetching: true,
        isPending: true,
        items: [],
      });

      expect(state.error).toBeNull();
      expect(state.isFetching).toBe(false);
      expect(state.isPending).toBe(false);
    });
  });

  describe("when enabled", () => {
    test("returns pending status when isPending=true and no error", () => {
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: null,
        isFetching: true,
        isPending: true,
        items: [],
      });

      expect(state.status).toBe("pending");
      expect(state.hasResolved).toBe(false);
      expect(state.isFetching).toBe(true);
      expect(state.isPending).toBe(true);
    });

    test("returns error status when error is set and not pending", () => {
      const err = new Error("query failed");
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: err,
        isFetching: false,
        isPending: false,
        items: [],
      });

      expect(state.status).toBe("error");
      expect(state.error).toBe(err);
      expect(state.hasResolved).toBe(true);
    });

    test("suppressedReason is always null when enabled", () => {
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: null,
        isFetching: false,
        isPending: false,
        items: [],
        suppressedReason: "instance-not-connected",
      });

      expect(state.suppressedReason).toBeNull();
      expect(state.isSuppressed).toBe(false);
    });
  });
});
