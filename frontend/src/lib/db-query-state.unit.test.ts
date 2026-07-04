import { describe, expect, test } from "vitest";
import { buildResourceCollectionQueryState } from "@/lib/db-query-state";

describe("buildResourceCollectionQueryState", () => {
  describe("when disabled (query suppressed)", () => {
    test("returns idle status with no data when items is empty", () => {
      const state = buildResourceCollectionQueryState({
        enabled: false,
        error: null,
        isFetching: false,
        isPending: false,
        items: [],
        suppressedReason: null,
      });

      expect(state.status).toBe("idle");
      expect(state.hasData).toBe(false);
      expect(state.isFetching).toBe(false);
      expect(state.isPending).toBe(false);
      expect(state.isSuppressed).toBe(false);
      expect(state.suppressedReason).toBeNull();
      expect(state.error).toBeNull();
      expect(state.hasResolved).toBe(false);
    });

    test("returns hasData=true when items is non-empty", () => {
      const state = buildResourceCollectionQueryState({
        enabled: false,
        error: null,
        isFetching: false,
        isPending: false,
        items: [{ id: 1 }],
        suppressedReason: null,
      });

      expect(state.hasData).toBe(true);
    });

    test("isSuppressed=true and hasResolved=true when suppressedReason is provided", () => {
      const state = buildResourceCollectionQueryState({
        enabled: false,
        error: null,
        isFetching: false,
        isPending: false,
        items: [],
        suppressedReason: "instance-not-connected",
      });

      expect(state.isSuppressed).toBe(true);
      expect(state.suppressedReason).toBe("instance-not-connected");
      expect(state.hasResolved).toBe(true);
    });

    test("isSuppressed=false and hasResolved=false when suppressedReason is omitted (undefined)", () => {
      const state = buildResourceCollectionQueryState({
        enabled: false,
        error: null,
        isFetching: false,
        isPending: false,
        items: [],
        // suppressedReason intentionally omitted
      });

      expect(state.isSuppressed).toBe(false);
      expect(state.suppressedReason).toBeNull();
      expect(state.hasResolved).toBe(false);
    });

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
    test("returns success status when no error and not pending", () => {
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: null,
        isFetching: false,
        isPending: false,
        items: ["a", "b"],
      });

      expect(state.status).toBe("success");
      expect(state.hasResolved).toBe(true);
      expect(state.hasData).toBe(true);
      expect(state.isSuppressed).toBe(false);
      expect(state.suppressedReason).toBeNull();
      expect(state.error).toBeNull();
    });

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

    test("error status takes priority over pending", () => {
      const err = new Error("network error");
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: err,
        isFetching: false,
        isPending: true,
        items: [],
      });

      expect(state.status).toBe("error");
      expect(state.error).toBe(err);
      expect(state.hasResolved).toBe(true);
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

    test("hasData=false when items is empty in success state", () => {
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: null,
        isFetching: false,
        isPending: false,
        items: [],
      });

      expect(state.hasData).toBe(false);
      expect(state.status).toBe("success");
    });

    test("passes through isFetching from caller", () => {
      const state = buildResourceCollectionQueryState({
        enabled: true,
        error: null,
        isFetching: true,
        isPending: false,
        items: ["x"],
      });

      expect(state.isFetching).toBe(true);
      expect(state.status).toBe("success");
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
