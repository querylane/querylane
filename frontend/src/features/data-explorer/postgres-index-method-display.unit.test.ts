import { describe, expect, test } from "vitest";
import { describePostgresIndexMethod } from "@/features/data-explorer/postgres-index-method-display";

describe("describePostgresIndexMethod", () => {
  test("explains built-in PostgreSQL access methods", () => {
    expect(describePostgresIndexMethod("btree")).toMatchObject({
      badges: expect.arrayContaining(["default", "range"]),
      label: "B-tree",
    });
    expect(describePostgresIndexMethod("hash")).toMatchObject({
      badges: expect.arrayContaining(["equality"]),
      label: "Hash",
    });
    expect(describePostgresIndexMethod("gin")).toMatchObject({
      badges: expect.arrayContaining(["inverted"]),
      label: "GIN",
    });
    expect(describePostgresIndexMethod("brin")).toMatchObject({
      badges: expect.arrayContaining(["block ranges"]),
      label: "BRIN",
    });
  });

  test("explains common extension index methods and custom fallback", () => {
    expect(describePostgresIndexMethod("bloom")).toMatchObject({
      label: "Bloom",
      source: "extension",
    });
    expect(describePostgresIndexMethod("hnsw")).toMatchObject({
      badges: expect.arrayContaining(["vector"]),
      label: "HNSW",
    });
    expect(describePostgresIndexMethod("my_custom_am")).toMatchObject({
      label: "my_custom_am",
      source: "custom",
      summary: expect.stringContaining("Custom PostgreSQL index access method"),
    });
  });
});
