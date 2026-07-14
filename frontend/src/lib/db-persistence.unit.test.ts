import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  arePersistedSelectionsEqual,
  NAVIGATION_SELECTION_STORAGE_KEY,
  normalizePersistedNavigationSelection,
  readPersistedNavigationSelectionStore,
  writePersistedNavigationSelectionStore,
} from "./db-persistence";

const TEST_NUMBER_42 = 42;

function createSessionStorage(values: Map<string, string>): Storage {
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function stubWindowSessionStorage(sessionStorage: Storage) {
  vi.stubGlobal("window", { sessionStorage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizePersistedNavigationSelection", () => {
  test("returns empty object for null", () => {
    expect(normalizePersistedNavigationSelection(null)).toEqual({});
  });

  test("returns empty object for non-object values", () => {
    expect(normalizePersistedNavigationSelection(TEST_NUMBER_42)).toEqual({});
    expect(normalizePersistedNavigationSelection("string")).toEqual({});
    expect(normalizePersistedNavigationSelection(undefined)).toEqual({});
  });

  test("extracts valid string database id", () => {
    const result = normalizePersistedNavigationSelection({
      databaseId: "db1",
    });
    expect(result).toEqual({ databaseId: "db1" });
  });

  test("ignores non-string database id", () => {
    const result = normalizePersistedNavigationSelection({
      databaseId: 123,
    });
    expect(result).toEqual({ databaseId: undefined });
  });

  test("treats whitespace-only database id as undefined", () => {
    const result = normalizePersistedNavigationSelection({
      databaseId: "   ",
    });
    expect(result).toEqual({ databaseId: undefined });
  });

  test("ignores legacy schema/table fields", () => {
    const result = normalizePersistedNavigationSelection({
      databaseId: "db1",
      schemaId: "public",
      tableId: "users",
    });
    expect(result).toEqual({ databaseId: "db1" });
  });
});

describe("readPersistedNavigationSelectionStore", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    stubWindowSessionStorage(createSessionStorage(storage));
  });

  test("returns empty object when sessionStorage has no entry", () => {
    expect(readPersistedNavigationSelectionStore()).toEqual({});
  });

  test("returns empty object for invalid JSON", () => {
    storage.set(NAVIGATION_SELECTION_STORAGE_KEY, "not json");
    expect(readPersistedNavigationSelectionStore()).toEqual({});
  });

  test("returns empty object when stored value is not an object", () => {
    storage.set(NAVIGATION_SELECTION_STORAGE_KEY, '"just a string"');
    expect(readPersistedNavigationSelectionStore()).toEqual({});
  });

  test("returns empty object for null JSON value", () => {
    storage.set(NAVIGATION_SELECTION_STORAGE_KEY, "null");
    expect(readPersistedNavigationSelectionStore()).toEqual({});
  });

  test("parses and normalizes stored selections", () => {
    storage.set(
      NAVIGATION_SELECTION_STORAGE_KEY,
      JSON.stringify({
        "inst-1": { databaseId: "db1" },
        "inst-2": { databaseId: "db2" },
      })
    );

    const result = readPersistedNavigationSelectionStore();
    expect(result).toEqual({
      "inst-1": { databaseId: "db1" },
      "inst-2": { databaseId: "db2" },
    });
  });

  test("normalizes invalid entries within the store", () => {
    storage.set(
      NAVIGATION_SELECTION_STORAGE_KEY,
      JSON.stringify({
        "inst-1": "not an object",
        "inst-2": null,
        "inst-3": { databaseId: "valid" },
      })
    );

    const result = readPersistedNavigationSelectionStore();
    expect(result["inst-1"]).toEqual({});
    expect(result["inst-2"]).toEqual({});
    expect(result["inst-3"]).toEqual({ databaseId: "valid" });
  });
});

describe("writePersistedNavigationSelectionStore", () => {
  test("writes JSON store and tolerates storage failures", () => {
    const values = new Map<string, string>();
    stubWindowSessionStorage(createSessionStorage(values));

    writePersistedNavigationSelectionStore({ inst: { databaseId: "db" } });

    expect(
      JSON.parse(values.get(NAVIGATION_SELECTION_STORAGE_KEY) ?? "{}")
    ).toEqual({ inst: { databaseId: "db" } });

    stubWindowSessionStorage({
      ...createSessionStorage(new Map()),
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });

    expect(() => writePersistedNavigationSelectionStore({})).not.toThrow();
  });
});

describe("arePersistedSelectionsEqual", () => {
  test("compares persisted selections by database id", () => {
    expect(
      arePersistedSelectionsEqual({ databaseId: "db" }, { databaseId: "db" })
    ).toBe(true);
    expect(
      arePersistedSelectionsEqual({ databaseId: "db" }, { databaseId: "other" })
    ).toBe(false);
  });
});
