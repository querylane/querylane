import { isNonEmptyString } from "@/lib/value-guards";
/**
 * Pure utility functions for resource selection resolution in the db-context cascade.
 * These have no side effects and are independently testable.
 */

export function resolveValidSelectionId({
  candidateId,
  items,
  loaded,
}: {
  candidateId?: string | undefined;
  items: readonly { id: string }[];
  loaded: boolean;
}): string | undefined {
  if (!isNonEmptyString(candidateId)) {
    return;
  }
  if (!loaded) {
    return candidateId;
  }
  return items.some((item) => item.id === candidateId)
    ? candidateId
    : undefined;
}

export function pickSelectedResource<Item extends { id: string }>(
  items: Item[],
  selectedId?: string
): Item | null {
  if (!isNonEmptyString(selectedId)) {
    return null;
  }
  return items.find((item) => item.id === selectedId) ?? null;
}

export function resolveSelectedResource<Item extends { id: string }>({
  fallbackItem,
  items,
  queryItem,
  selectedId,
}: {
  fallbackItem?: Item | null | undefined;
  items: Item[];
  queryItem: Item | null;
  selectedId?: string | undefined;
}): Item | null {
  return (
    queryItem ?? pickSelectedResource(items, selectedId) ?? fallbackItem ?? null
  );
}

export function isSelectedResourceResolved({
  queryEnabled,
  queryPending,
  selectedId,
  selectedResource,
}: {
  queryEnabled: boolean;
  queryPending: boolean;
  selectedId?: string | undefined;
  selectedResource: unknown;
}) {
  if (!isNonEmptyString(selectedId)) {
    return true;
  }

  return Boolean(selectedResource) || (queryEnabled && !queryPending);
}

export function shouldEnableDatabaseSelectionQuery({
  effectiveDatabaseId,
  effectiveInstanceId,
  hydrateSelectedDatabaseFromQuery,
}: {
  effectiveDatabaseId?: string | undefined;
  effectiveInstanceId?: string | undefined;
  hydrateSelectedDatabaseFromQuery: boolean;
}) {
  return Boolean(
    hydrateSelectedDatabaseFromQuery &&
      isNonEmptyString(effectiveInstanceId) &&
      effectiveDatabaseId
  );
}
