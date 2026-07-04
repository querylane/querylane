const NAVIGATION_SELECTION_STORAGE_KEY = "querylane.navigation-selection.v1";

interface PersistedNavigationSelection {
  databaseId?: string | undefined;
}

type PersistedNavigationSelectionStore = Record<
  string,
  PersistedNavigationSelection
>;

function readSearchString(
  search: Record<string, unknown>,
  key: string
): string | undefined {
  const value = search[key];
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePersistedNavigationSelection(
  value: unknown
): PersistedNavigationSelection {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  // allow-type-assertion: narrowing validated non-null object for property access after typeof guard
  const candidate = value as Record<string, unknown>;
  const databaseId = readSearchString(candidate, "databaseId");

  return {
    databaseId,
  };
}

function readPersistedNavigationSelectionStore(): PersistedNavigationSelectionStore {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      NAVIGATION_SELECTION_STORAGE_KEY
    );
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    return Object.fromEntries(
      // allow-type-assertion: parsing untyped JSON from sessionStorage after null/object guard
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        normalizePersistedNavigationSelection(value),
      ])
    );
  } catch {
    return {};
  }
}

function writePersistedNavigationSelectionStore(
  store: PersistedNavigationSelectionStore
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      NAVIGATION_SELECTION_STORAGE_KEY,
      JSON.stringify(store)
    );
  } catch {
    // Ignore storage write failures.
  }
}

function arePersistedSelectionsEqual(
  left: PersistedNavigationSelection,
  right: PersistedNavigationSelection
): boolean {
  return left.databaseId === right.databaseId;
}

export type { PersistedNavigationSelection, PersistedNavigationSelectionStore };
export {
  arePersistedSelectionsEqual,
  NAVIGATION_SELECTION_STORAGE_KEY,
  normalizePersistedNavigationSelection,
  readPersistedNavigationSelectionStore,
  writePersistedNavigationSelectionStore,
};
