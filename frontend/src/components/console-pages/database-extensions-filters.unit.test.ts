import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "@rstest/core";
import {
  extensionCategoryOptions,
  extensionInventorySummary,
  filterPresentedExtensions,
  presentExtensions,
} from "@/components/console-pages/database-extensions-filters";
import {
  type Extension,
  ExtensionSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";

const extensions: Extension[] = [
  create(ExtensionSchema, {
    comment: "text similarity measurement and index searching",
    defaultVersion: "1.6",
    displayName: "pg_trgm",
    installed: true,
    installedVersion: "1.6",
    name: "instances/prod/databases/customer-events/extensions/pg_trgm",
    schema: "public",
  }),
  create(ExtensionSchema, {
    comment: "PL/pgSQL procedural language",
    defaultVersion: "1.0",
    displayName: "plpgsql",
    installed: true,
    installedVersion: "1.0",
    name: "instances/prod/databases/customer-events/extensions/plpgsql",
    schema: "pg_catalog",
  }),
  create(ExtensionSchema, {
    comment: "generate universally unique identifiers",
    defaultVersion: "1.1",
    displayName: "uuid-ossp",
    installed: false,
    name: "instances/prod/databases/customer-events/extensions/uuid-ossp",
  }),
  create(ExtensionSchema, {
    comment: "functions for verifying relation integrity",
    defaultVersion: "1.4",
    displayName: "amcheck",
    installed: false,
    name: "instances/prod/databases/customer-events/extensions/amcheck",
  }),
];

describe("database extension filters", () => {
  test("keeps curated docs as an optional enrichment layer", () => {
    const presented = presentExtensions(extensions);

    expect(presented.map((extension) => extension.displayName)).toEqual([
      "pg_trgm",
      "plpgsql",
      "uuid-ossp",
      "amcheck",
    ]);
    expect(extensionInventorySummary(presented)).toBe(
      "2 installed · 2 available on this server"
    );

    const [pgTrgm] = presented;
    expect(pgTrgm?.curated).toBeDefined();
    expect(pgTrgm?.category).toBe("Search");
    expect(pgTrgm?.facts.map((fact) => fact.label)).toEqual([
      "Version",
      "Latest",
      "Schema",
      "Scope",
      "Source",
      "Requires",
    ]);
  });

  test("offers only curated categories as filter options", () => {
    const presented = presentExtensions(extensions);

    expect(extensionCategoryOptions(presented)).toEqual([
      { label: "Data types", value: "Data types" },
      { label: "Languages", value: "Languages" },
      { label: "Search", value: "Search" },
    ]);
  });

  test("filters presented extensions by search, status, and category", () => {
    const presented = presentExtensions(extensions);

    expect(
      filterPresentedExtensions(presented, {
        category: "All",
        search: "uuid",
        status: "available",
      }).map((extension) => extension.displayName)
    ).toEqual(["uuid-ossp"]);

    expect(
      filterPresentedExtensions(presented, {
        category: "Search",
        search: "",
        status: "All",
      }).map((extension) => extension.displayName)
    ).toEqual(["pg_trgm"]);

    expect(
      filterPresentedExtensions(presented, {
        category: "All",
        search: "verifying relation",
        status: "All",
      }).map((extension) => extension.displayName)
    ).toEqual(["amcheck"]);

    expect(
      filterPresentedExtensions(presented, {
        category: "All",
        search: "",
        status: "installed",
      })
    ).toHaveLength(2);
  });
});
