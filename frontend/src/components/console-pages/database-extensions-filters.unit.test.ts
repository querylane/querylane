import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  extensionFilterOptions,
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
];

describe("database extension filters", () => {
  test("presents extension inventory with redesign metadata", () => {
    const presented = presentExtensions(extensions);

    expect(presented.map((extension) => extension.displayName)).toEqual([
      "pg_trgm",
      "plpgsql",
      "uuid-ossp",
    ]);
    expect(extensionInventorySummary(presented)).toBe(
      "2 installed · 1 available on this server"
    );
    expect(extensionFilterOptions(presented)).toMatchObject({
      categories: [
        { label: "Data types", value: "Data types" },
        { label: "Languages", value: "Languages" },
        { label: "Search", value: "Search" },
      ],
      scopes: [
        { label: "per database", value: "database" },
        { label: "per table", value: "table" },
      ],
      sources: [
        { label: "Bundled", value: "bundled" },
        { label: "Core contrib", value: "core" },
      ],
      statuses: [
        { label: "Available", value: "available" },
        { label: "Installed", value: "installed" },
      ],
    });
  });

  test("presents version labels without duplicate v prefixes", () => {
    const presentedExtensions = presentExtensions([
      create(ExtensionSchema, {
        comment: "vector similarity search",
        defaultVersion: "v0.8.0",
        displayName: "pgvector",
        installed: true,
        installedVersion: "v0.8.0",
        name: "instances/prod/databases/customer-events/extensions/pgvector",
        schema: "public",
      }),
    ]);
    const [presented] = presentedExtensions;
    if (!presented) {
      throw new Error("Expected pgvector extension metadata");
    }

    expect(presented.versionLabel).toBe("0.8.0");
    expect(presented.defaultVersion).toBe("0.8.0");
    expect(presented.installedVersion).toBe("0.8.0");
    expect(presented.facts).toContainEqual({
      label: "Version",
      value: "0.8.0",
    });
  });

  test("filters presented extensions by search and redesign facets", () => {
    const presented = presentExtensions(extensions);

    expect(
      filterPresentedExtensions(presented, {
        category: "All",
        scope: "All",
        search: "uuid",
        source: "All",
        status: "available",
      }).map((extension) => extension.displayName)
    ).toEqual(["uuid-ossp"]);

    expect(
      filterPresentedExtensions(presented, {
        category: "Search",
        scope: "table",
        search: "",
        source: "core",
        status: "installed",
      }).map((extension) => extension.displayName)
    ).toEqual(["pg_trgm"]);
  });
});
