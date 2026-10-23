import { isNonEmptyString, isRecord } from "@/lib/value-guards";

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
  if (!isRecord(value)) {
    return {};
  }

  const databaseId = readSearchString(value, "databaseId");

  return {
    databaseId,
  };
}

function readPersistedNavigationSelectionStore(): PersistedNavigationSelectionStore {
  if (globalThis.window === undefined) {
    return {};
  }

  try {
    const rawValue = globalThis.window.sessionStorage.getItem(
      NAVIGATION_SELECTION_STORAGE_KEY
    );
    if (!isNonEmptyString(rawValue)) {
      return {};
    }

    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
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
  if (globalThis.window === undefined) {
    return;
  }

  try {
    globalThis.window.sessionStorage.setItem(
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
