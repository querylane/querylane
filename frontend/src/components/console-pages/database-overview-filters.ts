import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter";
import { allPredicates } from "@/lib/predicates";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

type CatalogObjectKindFilter =
  | "external-table"
  | "materialized-view"
  | "partitioned-table"
  | "table"
  | "temporary-table"
  | "view";

interface CatalogObjectKindRow {
  isMaterialized: boolean;
  kind: "table" | "view";
  tableType?: Table_TableType | undefined;
}

interface CatalogObjectFacetRow extends CatalogObjectKindRow {
  isSystem: boolean;
  owner: string;
  schemaId: string;
}

interface CatalogSchemaFacetRow {
  isSystemSchema: boolean;
  owner: string;
}

interface CatalogObjectFacetFilters {
  kindFilters: string[];
  ownerFilters: string[];
  schemaFilters: string[];
  systemFilters: string[];
}

interface CatalogSchemaFacetFilters {
  kindFilters: string[];
  ownerFilters: string[];
}

type CatalogSchemaKindFilter = "system" | "user";
type CatalogObjectSystemFilter = "system" | "user";

const EMPTY_OWNER_FILTER_VALUE = "__querylane_empty_owner__";
const EMPTY_SCHEMA_FILTER_VALUE = "__querylane_empty_schema__";
const CATALOG_OBJECT_KIND_OPTIONS = [
  { label: "Tables", value: "table" },
  { label: "Temporary tables", value: "temporary-table" },
  { label: "External tables", value: "external-table" },
  { label: "Partitioned tables", value: "partitioned-table" },
  { label: "Views", value: "view" },
  { label: "Materialized views", value: "materialized-view" },
] satisfies FacetedFilterOption[];
const CATALOG_SCHEMA_KIND_OPTIONS = [
  { label: "User", value: "user" },
  { label: "System", value: "system" },
] satisfies FacetedFilterOption[];
const CATALOG_OBJECT_SYSTEM_OPTIONS = [
  { label: "User", value: "user" },
  { label: "System", value: "system" },
] satisfies FacetedFilterOption[];

function schemaFilterValue(row: { schemaId: string }) {
  return row.schemaId.trim() || EMPTY_SCHEMA_FILTER_VALUE;
}

function schemaFilterLabel(value: string) {
  return value === EMPTY_SCHEMA_FILTER_VALUE ? "No schema" : value;
}

function ownerFilterValue(row: { owner: string }) {
  return row.owner.trim() || EMPTY_OWNER_FILTER_VALUE;
}

function ownerFilterLabel(value: string) {
  return value === EMPTY_OWNER_FILTER_VALUE ? "No owner" : value;
}

function catalogObjectSystemValue(
  object: CatalogObjectFacetRow
): CatalogObjectSystemFilter {
  return object.isSystem ? "system" : "user";
}

function catalogSchemaKindValue(
  schema: CatalogSchemaFacetRow
): CatalogSchemaKindFilter {
  return schema.isSystemSchema ? "system" : "user";
}

function catalogObjectKindValue(
  object: CatalogObjectKindRow
): CatalogObjectKindFilter {
  if (object.kind === "view") {
    return object.isMaterialized ? "materialized-view" : "view";
  }

  switch (object.tableType) {
    case Table_TableType.TEMPORARY:
      return "temporary-table";
    case Table_TableType.EXTERNAL:
      return "external-table";
    case Table_TableType.PARTITIONED:
      return "partitioned-table";
    case Table_TableType.BASE_TABLE:
    case Table_TableType.UNSPECIFIED:
    case undefined:
      return "table";
    default:
      return object.tableType satisfies never;
  }
}

function uniqueSortedOptions(
  values: string[],
  getLabel: (value: string) => string = (value) => value
): FacetedFilterOption[] {
  return Array.from(new Set(values))
    .sort((left, right) => getLabel(left).localeCompare(getLabel(right)))
    .map((value) => ({ label: getLabel(value), value }));
}

function presentCatalogObjectKindOptions(objects: CatalogObjectKindRow[]) {
  const presentKinds = new Set(objects.map(catalogObjectKindValue));
  return CATALOG_OBJECT_KIND_OPTIONS.filter((option) =>
    presentKinds.has(option.value as CatalogObjectKindFilter)
  );
}

function presentCatalogObjectSchemaOptions(objects: CatalogObjectFacetRow[]) {
  return uniqueSortedOptions(objects.map(schemaFilterValue), schemaFilterLabel);
}

function presentCatalogObjectSystemOptions(objects: CatalogObjectFacetRow[]) {
  const presentKinds = new Set(objects.map(catalogObjectSystemValue));
  return CATALOG_OBJECT_SYSTEM_OPTIONS.filter((option) =>
    presentKinds.has(option.value as CatalogObjectSystemFilter)
  );
}

function presentCatalogObjectOwnerOptions(objects: CatalogObjectFacetRow[]) {
  return uniqueSortedOptions(objects.map(ownerFilterValue), ownerFilterLabel);
}

function presentCatalogSchemaKindOptions(schemas: CatalogSchemaFacetRow[]) {
  const presentKinds = new Set(schemas.map(catalogSchemaKindValue));
  return CATALOG_SCHEMA_KIND_OPTIONS.filter((option) =>
    presentKinds.has(option.value as CatalogSchemaKindFilter)
  );
}

function presentCatalogSchemaOwnerOptions(schemas: CatalogSchemaFacetRow[]) {
  return uniqueSortedOptions(schemas.map(ownerFilterValue), ownerFilterLabel);
}

function filterCatalogObjectsByFacets<RowType extends CatalogObjectFacetRow>({
  kindFilters,
  objects,
  ownerFilters,
  schemaFilters,
  systemFilters,
}: CatalogObjectFacetFilters & { objects: RowType[] }): RowType[] {
  const kindFilterSet = new Set(kindFilters);
  const ownerFilterSet = new Set(ownerFilters);
  const schemaFilterSet = new Set(schemaFilters);
  const systemFilterSet = new Set(systemFilters);
  return objects.filter((object) => {
    if (
      allPredicates(
        () => kindFilters.length > 0,
        () => !kindFilterSet.has(catalogObjectKindValue(object))
      )
    ) {
      return false;
    }
    if (
      allPredicates(
        () => systemFilters.length > 0,
        () => !systemFilterSet.has(catalogObjectSystemValue(object))
      )
    ) {
      return false;
    }
    if (
      allPredicates(
        () => schemaFilters.length > 0,
        () => !schemaFilterSet.has(schemaFilterValue(object))
      )
    ) {
      return false;
    }
    if (
      allPredicates(
        () => ownerFilters.length > 0,
        () => !ownerFilterSet.has(ownerFilterValue(object))
      )
    ) {
      return false;
    }
    return true;
  });
}

function filterCatalogSchemasByFacets<RowType extends CatalogSchemaFacetRow>({
  kindFilters,
  ownerFilters,
  schemas,
}: CatalogSchemaFacetFilters & { schemas: RowType[] }): RowType[] {
  const kindFilterSet = new Set(kindFilters);
  const ownerFilterSet = new Set(ownerFilters);
  return schemas.filter((schema) => {
    if (
      kindFilters.length > 0 &&
      !kindFilterSet.has(catalogSchemaKindValue(schema))
    ) {
      return false;
    }
    if (
      ownerFilters.length > 0 &&
      !ownerFilterSet.has(ownerFilterValue(schema))
    ) {
      return false;
    }
    return true;
  });
}

export type { CatalogObjectFacetRow, CatalogSchemaFacetRow };
export {
  catalogObjectKindValue,
  filterCatalogObjectsByFacets,
  filterCatalogSchemasByFacets,
  presentCatalogObjectKindOptions,
  presentCatalogObjectOwnerOptions,
  presentCatalogObjectSchemaOptions,
  presentCatalogObjectSystemOptions,
  presentCatalogSchemaKindOptions,
  presentCatalogSchemaOwnerOptions,
};
