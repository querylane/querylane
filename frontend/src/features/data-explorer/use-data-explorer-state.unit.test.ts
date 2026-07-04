import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  buildExplorerSearch,
  catalogSyncNotice,
  normalizeExplorerSearch,
  selectionFromSearch,
} from "@/features/data-explorer/use-data-explorer-state";
import {
  CatalogSyncMetadataSchema,
  CatalogSyncStatus,
} from "@/protogen/querylane/console/v1alpha1/catalog_sync_pb";

describe("buildExplorerSearch", () => {
  test("updates resource identity while preserving sidebar state", () => {
    expect(
      buildExplorerSearch(
        {
          catalogSort: "size-desc",
          category: "tables",
          name: "order_items",
          q: "ord",
          schema: "public",
        },
        {
          category: "tables",
          name: "products",
          schema: "public",
        }
      )
    ).toEqual({
      catalogSort: "size-desc",
      category: "tables",
      name: "products",
      q: "ord",
      schema: "public",
    });
  });

  test("normalizes invalid resource fields as explicit removals", () => {
    expect(
      normalizeExplorerSearch({
        catalogSort: "name-asc",
        category: "wat",
        name: "orders",
        q: "orders",
        schema: "public",
      })
    ).toEqual({
      catalogSort: undefined,
      category: undefined,
      name: undefined,
      q: "orders",
      schema: "public",
    });
  });

  test("keeps stable resource identity and sidebar state in normalized URLs", () => {
    expect(
      normalizeExplorerSearch({
        catalogSort: "size-desc",
        category: "tables",
        name: "orders",
        q: "ord",
        schema: "public",
      })
    ).toEqual({
      catalogSort: "size-desc",
      category: "tables",
      name: "orders",
      q: "ord",
      schema: "public",
    });
  });
});

describe("selectionFromSearch", () => {
  test("returns schema selection for missing or invalid resource selection", () => {
    expect(selectionFromSearch({})).toEqual({ kind: "schema" });
    expect(selectionFromSearch({ category: "bogus", name: "x" })).toEqual({
      kind: "schema",
    });
    expect(selectionFromSearch({ category: "tables" })).toEqual({
      kind: "schema",
    });
    expect(selectionFromSearch({ category: "views" })).toEqual({
      kind: "schema",
    });
  });

  test("returns resource selection for valid category and name", () => {
    expect(selectionFromSearch({ category: "tables", name: "orders" })).toEqual(
      {
        category: "tables",
        kind: "resource",
        name: "orders",
      }
    );
    expect(
      selectionFromSearch({ category: "views", name: "active_users" })
    ).toEqual({
      category: "views",
      kind: "resource",
      name: "active_users",
    });
  });
});

describe("catalogSyncNotice", () => {
  test("returns no notice for fresh synced metadata", () => {
    expect(
      catalogSyncNotice({
        ...create(CatalogSyncMetadataSchema),
        isStale: false,
        syncError: "",
        syncStatus: CatalogSyncStatus.SYNCED,
      })
    ).toBeNull();
  });

  test("returns warning for failed refresh with cached data", () => {
    expect(
      catalogSyncNotice({
        ...create(CatalogSyncMetadataSchema),
        isStale: true,
        syncError: "upstream unavailable",
        syncStatus: CatalogSyncStatus.ERROR,
      })
    ).toEqual({
      message: "upstream unavailable",
      tone: "warning",
    });
  });

  test("returns warning fallback for failed refresh without error detail", () => {
    expect(
      catalogSyncNotice({
        ...create(CatalogSyncMetadataSchema),
        isStale: true,
        syncError: "",
        syncStatus: CatalogSyncStatus.ERROR,
      })
    ).toEqual({
      message: "Showing cached catalog. Refresh failed.",
      tone: "warning",
    });
  });

  test("returns info for stale cache while refresh is in flight", () => {
    expect(
      catalogSyncNotice({
        ...create(CatalogSyncMetadataSchema),
        isStale: true,
        syncError: "",
        syncStatus: CatalogSyncStatus.SYNCING,
      })
    ).toEqual({
      message: "Refreshing catalog. Showing cached results.",
      tone: "info",
    });
  });

  test("returns info before initial catalog sync completes", () => {
    expect(
      catalogSyncNotice({
        ...create(CatalogSyncMetadataSchema),
        isStale: true,
        syncError: "",
        syncStatus: CatalogSyncStatus.NEVER_SYNCED,
      })
    ).toEqual({
      message: "Catalog sync has not completed yet.",
      tone: "info",
    });
  });
});
