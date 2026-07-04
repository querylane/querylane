import { describe, expect, test } from "vitest";

import {
  isSelectedResourceResolved,
  pickSelectedResource,
  resolveSelectedResource,
  resolveValidSelectionId,
  shouldEnableDatabaseSelectionQuery,
} from "./db-selection-utils";

const ITEMS = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Charlie" },
];

describe("resolveValidSelectionId", () => {
  test("returns undefined when no candidateId", () => {
    expect(
      resolveValidSelectionId({
        candidateId: undefined,
        items: ITEMS,
        loaded: true,
      })
    ).toBeUndefined();
  });

  test("returns candidateId when items not yet loaded", () => {
    expect(
      resolveValidSelectionId({ candidateId: "x", items: [], loaded: false })
    ).toBe("x");
  });

  test("returns candidateId when it matches an item", () => {
    expect(
      resolveValidSelectionId({ candidateId: "b", items: ITEMS, loaded: true })
    ).toBe("b");
  });

  test("returns undefined when candidateId does not match any item", () => {
    expect(
      resolveValidSelectionId({ candidateId: "z", items: ITEMS, loaded: true })
    ).toBeUndefined();
  });

  test("returns candidateId with empty items when not loaded", () => {
    expect(
      resolveValidSelectionId({ candidateId: "a", items: [], loaded: false })
    ).toBe("a");
  });
});

describe("pickSelectedResource", () => {
  test("returns null when no selectedId", () => {
    expect(pickSelectedResource(ITEMS, undefined)).toBeNull();
  });

  test("returns matching item", () => {
    expect(pickSelectedResource(ITEMS, "b")).toEqual({ id: "b", name: "Beta" });
  });

  test("returns null when no match found", () => {
    expect(pickSelectedResource(ITEMS, "z")).toBeNull();
  });

  test("returns null for empty items", () => {
    expect(pickSelectedResource([], "a")).toBeNull();
  });
});

describe("resolveSelectedResource", () => {
  test("prefers queryItem over list item", () => {
    const queryItem = { id: "a", name: "Query Alpha" };
    const result = resolveSelectedResource({
      items: ITEMS,
      queryItem,
      selectedId: "a",
    });
    expect(result).toBe(queryItem);
  });

  test("falls back to list item when no queryItem", () => {
    const result = resolveSelectedResource({
      items: ITEMS,
      queryItem: null,
      selectedId: "b",
    });
    expect(result).toEqual({ id: "b", name: "Beta" });
  });

  test("falls back to fallbackItem when not in list or query", () => {
    const fallback = { id: "x", name: "Fallback" };
    const result = resolveSelectedResource({
      fallbackItem: fallback,
      items: ITEMS,
      queryItem: null,
      selectedId: "x",
    });
    expect(result).toBe(fallback);
  });

  test("returns null when nothing matches", () => {
    const result = resolveSelectedResource({
      items: ITEMS,
      queryItem: null,
      selectedId: "z",
    });
    expect(result).toBeNull();
  });

  test("returns null when no selectedId", () => {
    const result = resolveSelectedResource({
      items: ITEMS,
      queryItem: null,
      selectedId: undefined,
    });
    expect(result).toBeNull();
  });
});

describe("isSelectedResourceResolved", () => {
  test("returns true when no selectedId", () => {
    expect(
      isSelectedResourceResolved({
        queryEnabled: false,
        queryPending: false,
        selectedId: undefined,
        selectedResource: null,
      })
    ).toBe(true);
  });

  test("returns true when resource is found", () => {
    expect(
      isSelectedResourceResolved({
        queryEnabled: true,
        queryPending: false,
        selectedId: "a",
        selectedResource: { id: "a" },
      })
    ).toBe(true);
  });

  test("returns true when query enabled and no longer pending", () => {
    expect(
      isSelectedResourceResolved({
        queryEnabled: true,
        queryPending: false,
        selectedId: "a",
        selectedResource: null,
      })
    ).toBe(true);
  });

  test("returns false when query pending and no resource yet", () => {
    expect(
      isSelectedResourceResolved({
        queryEnabled: true,
        queryPending: true,
        selectedId: "a",
        selectedResource: null,
      })
    ).toBe(false);
  });
});

describe("shouldEnableDatabaseSelectionQuery", () => {
  test("returns true when all conditions met", () => {
    expect(
      shouldEnableDatabaseSelectionQuery({
        effectiveDatabaseId: "db1",
        effectiveInstanceId: "inst1",
        hydrateSelectedDatabaseFromQuery: true,
      })
    ).toBe(true);
  });

  test("returns false when hydration disabled", () => {
    expect(
      shouldEnableDatabaseSelectionQuery({
        effectiveDatabaseId: "db1",
        effectiveInstanceId: "inst1",
        hydrateSelectedDatabaseFromQuery: false,
      })
    ).toBe(false);
  });

  test("returns false when instanceId missing", () => {
    expect(
      shouldEnableDatabaseSelectionQuery({
        effectiveDatabaseId: "db1",
        effectiveInstanceId: undefined,
        hydrateSelectedDatabaseFromQuery: true,
      })
    ).toBe(false);
  });
});
