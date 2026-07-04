import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter";

interface DatabaseFacetRow {
  characterSet: string;
  collation: string;
  isSystemDatabase: boolean;
  owner: string;
}

interface DatabaseFacetFilters {
  encodingFilters: string[];
  kindFilters: string[];
  ownerFilters: string[];
}

const EMPTY_DATABASE_ENCODING_FILTER_VALUE = "__querylane_empty_encoding__";
const EMPTY_DATABASE_OWNER_FILTER_VALUE = "__querylane_empty_owner__";
const DATABASE_KIND_FILTER_OPTIONS = [
  { label: "User", value: "user" },
  { label: "System", value: "system" },
] satisfies FacetedFilterOption[];

function databaseKindFilterValue(database: DatabaseFacetRow) {
  return database.isSystemDatabase ? "system" : "user";
}

function databaseEncodingFilterValue(database: DatabaseFacetRow) {
  const characterSet = database.characterSet.trim();
  const collation = database.collation.trim();

  if (!(characterSet || collation)) {
    return EMPTY_DATABASE_ENCODING_FILTER_VALUE;
  }

  return `${characterSet}\u0000${collation}`;
}

function databaseEncodingFilterLabel(value: string) {
  if (value === EMPTY_DATABASE_ENCODING_FILTER_VALUE) {
    return "No encoding";
  }

  const [characterSet = "", collation = ""] = value.split("\u0000");
  if (characterSet && collation) {
    return `${characterSet} / ${collation}`;
  }
  return characterSet || collation || "No encoding";
}

function databaseOwnerFilterValue(database: DatabaseFacetRow) {
  return database.owner.trim() || EMPTY_DATABASE_OWNER_FILTER_VALUE;
}

function databaseOwnerFilterLabel(value: string) {
  return value === EMPTY_DATABASE_OWNER_FILTER_VALUE ? "No owner" : value;
}

function uniqueSortedFilterOptions(
  values: string[],
  getLabel: (value: string) => string = (value) => value
): FacetedFilterOption[] {
  return Array.from(new Set(values))
    .sort((left, right) => getLabel(left).localeCompare(getLabel(right)))
    .map((value) => ({ label: getLabel(value), value }));
}

function presentDatabaseKindOptions(databases: DatabaseFacetRow[]) {
  const presentKinds = new Set<string>(databases.map(databaseKindFilterValue));
  return DATABASE_KIND_FILTER_OPTIONS.filter((option) =>
    presentKinds.has(option.value)
  );
}

function presentDatabaseEncodingOptions(databases: DatabaseFacetRow[]) {
  return uniqueSortedFilterOptions(
    databases.map(databaseEncodingFilterValue),
    databaseEncodingFilterLabel
  );
}

function presentDatabaseOwnerOptions(databases: DatabaseFacetRow[]) {
  return uniqueSortedFilterOptions(
    databases.map(databaseOwnerFilterValue),
    databaseOwnerFilterLabel
  );
}

function filterDatabasesByFacets<RowType extends DatabaseFacetRow>({
  databases,
  encodingFilters,
  kindFilters,
  ownerFilters,
}: DatabaseFacetFilters & { databases: RowType[] }): RowType[] {
  return databases.filter((database) => {
    if (
      kindFilters.length > 0 &&
      !kindFilters.includes(databaseKindFilterValue(database))
    ) {
      return false;
    }
    if (
      encodingFilters.length > 0 &&
      !encodingFilters.includes(databaseEncodingFilterValue(database))
    ) {
      return false;
    }
    if (
      ownerFilters.length > 0 &&
      !ownerFilters.includes(databaseOwnerFilterValue(database))
    ) {
      return false;
    }
    return true;
  });
}

export type { DatabaseFacetRow };
export {
  filterDatabasesByFacets,
  presentDatabaseEncodingOptions,
  presentDatabaseKindOptions,
  presentDatabaseOwnerOptions,
};
