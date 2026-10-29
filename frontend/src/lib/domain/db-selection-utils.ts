import { isNonEmptyString } from "@/lib/value-guards";
/**
 * Pure utility functions for resource selection resolution in the db-context cascade.
 * These have no side effects and are independently testable.
 */

export function resolveValidSelectionId({
  candidateId,
  items,
  loaded,
}: Readonly<{
  candidateId?: string | undefined;
  items: readonly { readonly id: string }[];
  loaded: boolean;
}>): string | undefined {
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

export function pickSelectedResource<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId?: string
): Item | null {
  if (!isNonEmptyString(selectedId)) {
    return null;
  }
  return items.find((item) => item.id === selectedId) ?? null;
}

export function resolveSelectedResource<Item extends { readonly id: string }>({
  fallbackItem,
  items,
  queryItem,
  selectedId,
}: Readonly<{
  fallbackItem?: Item | null | undefined;
  items: readonly Item[];
  queryItem: Item | null;
  selectedId?: string | undefined;
}>): Item | null {
  return (
    queryItem ?? pickSelectedResource(items, selectedId) ?? fallbackItem ?? null
  );
}

export function isSelectedResourceResolved({
  queryEnabled,
  queryPending,
  selectedId,
  selectedResource,
}: Readonly<{
  queryEnabled: boolean;
  queryPending: boolean;
  selectedId?: string | undefined;
  selectedResource: unknown;
}>): boolean {
  if (!isNonEmptyString(selectedId)) {
    return true;
  }

  return Boolean(selectedResource) || (queryEnabled && !queryPending);
}

export function shouldEnableDatabaseSelectionQuery({
  effectiveDatabaseId,
  effectiveInstanceId,
  hydrateSelectedDatabaseFromQuery,
}: Readonly<{
  effectiveDatabaseId?: string | undefined;
  effectiveInstanceId?: string | undefined;
  hydrateSelectedDatabaseFromQuery: boolean;
}>): boolean {
  return Boolean(
    hydrateSelectedDatabaseFromQuery &&
      isNonEmptyString(effectiveInstanceId) &&
      effectiveDatabaseId
  );
}
