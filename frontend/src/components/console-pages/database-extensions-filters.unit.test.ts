import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  filterExtensionsByFacets,
  presentExtensionSchemaOptions,
  presentExtensionStatusOptions,
} from "@/components/console-pages/database-extensions-filters";
import {
  type Extension,
  ExtensionSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";

const extensions: Extension[] = [
  create(ExtensionSchema, {
    displayName: "pg_trgm",
    installed: true,
    schema: "public",
  }),
  create(ExtensionSchema, {
    displayName: "plpgsql",
    installed: true,
    schema: "pg_catalog",
  }),
  create(ExtensionSchema, {
    displayName: "uuid-ossp",
    installed: false,
  }),
];

describe("database extension filters", () => {
  test("builds status and schema facets from loaded extensions", () => {
    expect(presentExtensionStatusOptions(extensions)).toEqual([
      { label: "Installed", value: "installed" },
      { label: "Available", value: "available" },
    ]);
    expect(presentExtensionSchemaOptions(extensions)).toEqual([
      { label: "pg_catalog", value: "pg_catalog" },
      { label: "public", value: "public" },
      { label: "No schema", value: "__no_schema__" },
    ]);
  });

  test("filters extensions by status and schema together", () => {
    expect(
      filterExtensionsByFacets({
        extensions,
        schemaFilters: ["public"],
        statusFilters: ["installed"],
      }).map((extension) => extension.displayName)
    ).toEqual(["pg_trgm"]);

    expect(
      filterExtensionsByFacets({
        extensions,
        schemaFilters: ["__no_schema__"],
        statusFilters: ["available"],
      }).map((extension) => extension.displayName)
    ).toEqual(["uuid-ossp"]);
  });
});
