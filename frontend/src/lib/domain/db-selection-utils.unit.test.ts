import { describe, expect, test } from "@rstest/core";

import {
  isSelectedResourceResolved,
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
});

describe("resolveSelectedResource", () => {
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
});
