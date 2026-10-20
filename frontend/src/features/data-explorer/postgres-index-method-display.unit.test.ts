import { describe, expect, test } from "@rstest/core";
import { describePostgresIndexMethod } from "@/features/data-explorer/postgres-index-method-display";

describe("describePostgresIndexMethod", () => {
  test("explains built-in PostgreSQL access methods", () => {
    expect(describePostgresIndexMethod("btree")).toMatchObject({
      badges: expect.arrayContaining(["default", "range"]) as unknown,
      label: "B-tree",
    });
    expect(describePostgresIndexMethod("hash")).toMatchObject({
      badges: expect.arrayContaining(["equality"]) as unknown,
      label: "Hash",
    });
    expect(describePostgresIndexMethod("gin")).toMatchObject({
      badges: expect.arrayContaining(["inverted"]) as unknown,
      label: "GIN",
    });
    expect(describePostgresIndexMethod("brin")).toMatchObject({
      badges: expect.arrayContaining(["block ranges"]) as unknown,
      label: "BRIN",
    });
  });

  test("explains common extension index methods and custom fallback", () => {
    expect(describePostgresIndexMethod("bloom")).toMatchObject({
      label: "Bloom",
      source: "extension",
    });
    expect(describePostgresIndexMethod("hnsw")).toMatchObject({
      badges: expect.arrayContaining(["vector"]) as unknown,
      label: "HNSW",
    });
    expect(describePostgresIndexMethod("my_custom_am")).toMatchObject({
      label: "my_custom_am",
      source: "custom",
      summary: expect.stringContaining(
        "Custom PostgreSQL index access method"
      ) as unknown,
    });
  });
});
