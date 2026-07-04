import { describe, expect, test } from "vitest";
import {
  type DatabaseFacetRow,
  filterDatabasesByFacets,
  presentDatabaseEncodingOptions,
  presentDatabaseKindOptions,
  presentDatabaseOwnerOptions,
} from "@/components/console-pages/instance-database-filters";

interface TestDatabase extends DatabaseFacetRow {
  name: string;
}

const databases: TestDatabase[] = [
  {
    characterSet: "UTF8",
    collation: "en_US.UTF-8",
    isSystemDatabase: false,
    name: "customer_events",
    owner: "data-platform",
  },
  {
    characterSet: "LATIN1",
    collation: "C",
    isSystemDatabase: false,
    name: "analytics_archive",
    owner: "data-platform",
  },
  {
    characterSet: "UTF8",
    collation: "C",
    isSystemDatabase: true,
    name: "postgres",
    owner: "postgres",
  },
];

function optionValue(
  options: { label: string; value: string }[],
  label: string
) {
  const option = options.find((candidate) => candidate.label === label);
  if (!option) {
    throw new Error(`Missing option ${label}`);
  }
  return option.value;
}

describe("instance database filters", () => {
  test("builds kind, encoding, and owner facets from loaded databases", () => {
    expect(presentDatabaseKindOptions(databases)).toEqual([
      { label: "User", value: "user" },
      { label: "System", value: "system" },
    ]);
    expect(
      presentDatabaseEncodingOptions(databases).map((option) => option.label)
    ).toEqual(["LATIN1 / C", "UTF8 / C", "UTF8 / en_US.UTF-8"]);
    expect(
      presentDatabaseOwnerOptions(databases).map((option) => option.label)
    ).toEqual(["data-platform", "postgres"]);
  });

  test("filters databases by kind, encoding, and owner together", () => {
    const latinEncoding = optionValue(
      presentDatabaseEncodingOptions(databases),
      "LATIN1 / C"
    );

    expect(
      filterDatabasesByFacets({
        databases,
        encodingFilters: [latinEncoding],
        kindFilters: ["user"],
        ownerFilters: ["data-platform"],
      }).map((database) => database.name)
    ).toEqual(["analytics_archive"]);

    expect(
      filterDatabasesByFacets({
        databases,
        encodingFilters: [],
        kindFilters: ["system"],
        ownerFilters: ["postgres"],
      }).map((database) => database.name)
    ).toEqual(["postgres"]);
  });
});
