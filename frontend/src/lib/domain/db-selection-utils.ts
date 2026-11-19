import { isNonEmptyString } from "@/lib/value-guards";
/**
 * Pure utility functions for resource selection resolution in the db-context cascade.
 * These have no side effects and are independently testable.
 */

export const resolveValidSelectionId: ({
  candidateId,
  items,
  loaded,
}: Readonly<{
  candidateId?: string | undefined;
  items: readonly { readonly id: string }[];
  loaded: boolean;
}>) => string | undefined = ({ candidateId, items, loaded }) => {
  if (!isNonEmptyString(candidateId)) {
    return undefined;
  }
  if (!loaded) {
    return candidateId;
  }
  return items.some((item) => item.id === candidateId)
    ? candidateId
    : undefined;
};

export const pickSelectedResource: <Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId?: string
) => Item | null = (items, selectedId) => {
  if (!isNonEmptyString(selectedId)) {
    return null;
  }
  return items.find((item) => item.id === selectedId) ?? null;
};

export const resolveSelectedResource: <Item extends { readonly id: string }>({
  fallbackItem,
  items,
  queryItem,
  selectedId,
}: Readonly<{
  fallbackItem?: Item | null | undefined;
  items: readonly Item[];
  queryItem: Item | null;
  selectedId?: string | undefined;
}>) => Item | null = ({ fallbackItem, items, queryItem, selectedId }) =>
  queryItem ?? pickSelectedResource(items, selectedId) ?? fallbackItem ?? null;

export const isSelectedResourceResolved: ({
  queryEnabled,
  queryPending,
  selectedId,
  selectedResource,
}: Readonly<{
  queryEnabled: boolean;
  queryPending: boolean;
  selectedId?: string | undefined;
  selectedResource: unknown;
}>) => boolean = ({
  queryEnabled,
  queryPending,
  selectedId,
  selectedResource,
}) => {
  if (!isNonEmptyString(selectedId)) {
    return true;
  }

  return Boolean(selectedResource) || (queryEnabled && !queryPending);
};

export const shouldEnableDatabaseSelectionQuery: ({
  effectiveDatabaseId,
  effectiveInstanceId,
  hydrateSelectedDatabaseFromQuery,
}: Readonly<{
  effectiveDatabaseId?: string | undefined;
  effectiveInstanceId?: string | undefined;
  hydrateSelectedDatabaseFromQuery: boolean;
}>) => boolean = ({
  effectiveDatabaseId,
  effectiveInstanceId,
  hydrateSelectedDatabaseFromQuery,
}) =>
  Boolean(
    hydrateSelectedDatabaseFromQuery &&
      isNonEmptyString(effectiveInstanceId) &&
      effectiveDatabaseId
  );
