import { formatLastFetchedLabel } from "@/features/data-explorer/last-fetched-label";

interface RefreshableMetadataQuery {
  dataUpdatedAt: number;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}
interface MetadataToolbar {
  handleRefresh: () => Promise<unknown>;
  handleRetry: () => Promise<unknown>;
  isRefreshing: boolean;
  lastFetchedLabel: string;
}
function deriveMetadataToolbar(
  queries: RefreshableMetadataQuery[]
): MetadataToolbar {
  const updatedTimes = queries.map((query) => query.dataUpdatedAt || 0);
  const dataUpdatedAt = updatedTimes.includes(0)
    ? 0
    : Math.min(...updatedTimes);
  return {
    handleRefresh: () => Promise.all(queries.map((query) => query.refetch())),
    handleRetry: () => Promise.all(queries.map((query) => query.refetch())),
    isRefreshing: queries.some((query) => query.isFetching),
    lastFetchedLabel: formatLastFetchedLabel(dataUpdatedAt),
  };
}

export type { MetadataToolbar };
export { deriveMetadataToolbar };
