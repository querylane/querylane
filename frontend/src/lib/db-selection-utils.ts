/**
 * Pure utility functions for resource selection resolution in the db-context cascade.
 * These have no side effects and are independently testable.
 */

export function resolveValidSelectionId<Item extends { id: string }>({
  candidateId,
  items,
  loaded,
}: {
  candidateId?: string | undefined;
  items: Item[];
  loaded: boolean;
}): string | undefined {
  if (!candidateId) {
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
  if (!selectedId) {
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

export function isSelectedResourceResolved<Item>({
  queryEnabled,
  queryPending,
  selectedId,
  selectedResource,
}: {
  queryEnabled: boolean;
  queryPending: boolean;
  selectedId?: string | undefined;
  selectedResource: Item | null;
}) {
  if (!selectedId) {
    return true;
  }

  return Boolean(selectedResource || (queryEnabled && !queryPending));
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
      effectiveInstanceId &&
      effectiveDatabaseId
  );
}
