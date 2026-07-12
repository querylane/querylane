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
          category: "tables",
          name: "order_items",
          q: "ord",
          schema: "public",
          tab: "indexes",
        },
        {
          category: "tables",
          name: "products",
          schema: "public",
        }
      )
    ).toEqual({
      category: "tables",
      name: "products",
      q: "ord",
      schema: "public",
      tab: "indexes",
    });
  });

  test("normalizes invalid resource fields as explicit removals", () => {
    expect(
      normalizeExplorerSearch({
        category: "wat",
        name: "orders",
        q: "orders",
        schema: "public",
        tab: "columns",
      })
    ).toEqual({
      category: undefined,
      name: undefined,
      q: "orders",
      schema: "public",
      tab: undefined,
    });
  });

  test("keeps stable resource identity and sidebar state in normalized URLs", () => {
    expect(
      normalizeExplorerSearch({
        category: "tables",
        name: "orders",
        q: "ord",
        schema: "public",
        tab: "columns",
      })
    ).toEqual({
      category: "tables",
      name: "orders",
      q: "ord",
      schema: "public",
      tab: "columns",
    });
  });

  test("omits the default table detail tab and strips tab for non-table resources", () => {
    expect(
      normalizeExplorerSearch({
        category: "tables",
        name: "orders",
        schema: "public",
        tab: "data",
      })
    ).toEqual({
      category: "tables",
      name: "orders",
      q: undefined,
      schema: "public",
      tab: undefined,
    });

    expect(
      normalizeExplorerSearch({
        category: "views",
        name: "active_orders",
        schema: "public",
        tab: "indexes",
      })
    ).toEqual({
      category: "views",
      name: "active_orders",
      q: undefined,
      schema: "public",
      tab: undefined,
    });
  });

  test("keeps the schema map tab only for schema overview selections", () => {
    expect(
      normalizeExplorerSearch({
        schema: "public",
        tab: "map",
      })
    ).toEqual({
      category: undefined,
      name: undefined,
      q: undefined,
      schema: "public",
      tab: "map",
    });

    expect(
      normalizeExplorerSearch({
        category: "tables",
        name: "orders",
        schema: "public",
        tab: "map",
      })
    ).toEqual({
      category: "tables",
      name: "orders",
      q: undefined,
      schema: "public",
      tab: undefined,
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
