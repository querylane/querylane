import { describe, expect, test } from "vitest";
import {
  type DataExplorerSearch,
  dataExplorerSearchSchema,
} from "@/features/data-explorer/data-explorer-route-search";

describe("dataExplorerSearchSchema", () => {
  test("keeps route-owned search parsing independent and permissive", () => {
    const search: DataExplorerSearch = dataExplorerSearchSchema.parse({
      catalogSort: "size_desc",
      category: "tables",
      name: "orders",
      q: "ord",
      schema: "public",
    });

    expect(search).toEqual({
      catalogSort: "size_desc",
      category: "tables",
      name: "orders",
      q: "ord",
      schema: "public",
    });
  });
});
