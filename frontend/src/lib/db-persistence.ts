import { isNonEmptyString, isRecord } from "@/lib/value-guards";

const NAVIGATION_SELECTION_STORAGE_KEY = "querylane.navigation-selection.v1";

interface PersistedNavigationSelection {
  databaseId?: string | undefined;
}

type PersistedNavigationSelectionStore = Record<
  string,
  PersistedNavigationSelection
>;

function readSearchString(search: Record<string, unknown>, key: string) {
  const value = search[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePersistedNavigationSelection(value: unknown) {
  if (!isRecord(value)) {
    return {} satisfies PersistedNavigationSelection;
  }

  const databaseId = readSearchString(value, "databaseId");

  return {
    databaseId,
  } satisfies PersistedNavigationSelection;
}

function readPersistedNavigationSelectionStore() {
  if (globalThis.window === undefined) {
    return {} satisfies PersistedNavigationSelectionStore;
  }

  try {
    const rawValue = globalThis.window.sessionStorage.getItem(
      NAVIGATION_SELECTION_STORAGE_KEY
    );
    if (!isNonEmptyString(rawValue)) {
      return {} satisfies PersistedNavigationSelectionStore;
    }

    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed)) {
      return {} satisfies PersistedNavigationSelectionStore;
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        normalizePersistedNavigationSelection(value),
      ])
    );
  } catch {
    return {} satisfies PersistedNavigationSelectionStore;
  }
}

function writePersistedNavigationSelectionStore(
  store: PersistedNavigationSelectionStore
) {
  if (globalThis.window === undefined) {
    return false;
  }

  try {
    globalThis.window.sessionStorage.setItem(
      NAVIGATION_SELECTION_STORAGE_KEY,
      JSON.stringify(store)
    );
    return true;
  } catch {
    return false;
  }
}

function arePersistedSelectionsEqual(
  left: PersistedNavigationSelection,
  right: PersistedNavigationSelection
) {
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
