import type {
  ResourceCollectionQueryState,
  ResourceCollectionQueryStatus,
  ResourceCollectionSuppressedReason,
} from "@/lib/db-resource-mappers";

function buildResourceCollectionQueryState<Item>({
  enabled,
  error,
  isFetching,
  isPending,
  items,
  suppressedReason,
}: {
  enabled: boolean;
  error: unknown;
  isFetching: boolean;
  isPending: boolean;
  items: Item[];
  suppressedReason?: ResourceCollectionSuppressedReason | null;
}): ResourceCollectionQueryState {
  if (!enabled) {
    const normalizedSuppressedReason = suppressedReason ?? null;
    return {
      error: null,
      hasData: items.length > 0,
      hasResolved: normalizedSuppressedReason !== null,
      isFetching: false,
      isPending: false,
      isSuppressed: normalizedSuppressedReason !== null,
      status: "idle",
      suppressedReason: normalizedSuppressedReason,
    };
  }

  const normalizedError = error ?? null;
  let status: ResourceCollectionQueryStatus = "success";
  if (normalizedError) {
    status = "error";
  } else if (isPending) {
    status = "pending";
  }

  return {
    error: normalizedError,
    hasData: items.length > 0,
    hasResolved: status !== "pending",
    isFetching,
    isPending,
    isSuppressed: false,
    status,
    suppressedReason: null,
  };
}

export { buildResourceCollectionQueryState };
