import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import {
  DEFAULT_TABLE_LIST_SORT,
  isTableListSort,
} from "@/features/data-explorer/data-explorer-table-list-sort";
import {
  type CategoryKey,
  isCategoryKey,
  type Selection,
} from "@/features/data-explorer/data-explorer-types";
import {
  type CatalogSyncMetadata,
  CatalogSyncStatus,
} from "@/protogen/querylane/console/v1alpha1/catalog_sync_pb";

function parseCategory(value: string | undefined): CategoryKey | undefined {
  if (!value) {
    return;
  }
  return isCategoryKey(value) ? value : undefined;
}

function selectionFromSearch(search: DataExplorerSearch): Selection {
  const category = parseCategory(search.category);
  if (category && search.name) {
    return { category, kind: "resource", name: search.name };
  }
  return { kind: "schema" };
}

function buildExplorerSearch(
  previous: DataExplorerSearch,
  patch: {
    catalogSort?: string | undefined;
    category?: CategoryKey | undefined;
    name?: string | undefined;
    q?: string | undefined;
    schema?: string | undefined;
  }
): DataExplorerSearch {
  return { ...previous, ...patch };
}

function normalizeExplorerSearch(
  search: DataExplorerSearch
): DataExplorerSearch {
  const category = parseCategory(search.category);
  const hasResourceSelection = Boolean(category && search.name);
  const normalized: DataExplorerSearch = {
    catalogSort: undefined,
    category: undefined,
    name: undefined,
    q: undefined,
    schema: undefined,
  };
  if (search.catalogSort && isTableListSort(search.catalogSort)) {
    normalized.catalogSort =
      search.catalogSort === DEFAULT_TABLE_LIST_SORT
        ? undefined
        : search.catalogSort;
  }
  if (search.q?.trim()) {
    normalized.q = search.q;
  }
  if (search.schema) {
    normalized.schema = search.schema;
  }
  if (hasResourceSelection) {
    normalized.category = category;
    normalized.name = search.name;
  }
  return normalized;
}
function isExplorerSearchNormalized(search: DataExplorerSearch): boolean {
  const normalized = normalizeExplorerSearch(search);
  return (
    normalized.category === search.category &&
    normalized.catalogSort === search.catalogSort &&
    normalized.name === search.name &&
    normalized.q === search.q &&
    normalized.schema === search.schema
  );
}
interface CatalogSyncNotice {
  message: string;
  tone: "info" | "warning";
}

function catalogSyncNotice(
  metadata: CatalogSyncMetadata | undefined
): CatalogSyncNotice | null {
  if (!metadata) {
    return null;
  }

  if (metadata.syncStatus === CatalogSyncStatus.ERROR) {
    return {
      message: metadata.syncError || "Showing cached catalog. Refresh failed.",
      tone: "warning",
    };
  }

  if (metadata.syncStatus === CatalogSyncStatus.SYNCING && metadata.isStale) {
    return {
      message: "Refreshing catalog. Showing cached results.",
      tone: "info",
    };
  }

  if (metadata.syncStatus === CatalogSyncStatus.NEVER_SYNCED) {
    return {
      message: "Catalog sync has not completed yet.",
      tone: "info",
    };
  }

  return null;
}

export {
  buildExplorerSearch,
  catalogSyncNotice,
  isExplorerSearchNormalized,
  normalizeExplorerSearch,
  selectionFromSearch,
};
