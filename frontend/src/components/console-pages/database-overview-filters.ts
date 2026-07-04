import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter";

interface CatalogObjectFacetRow {
  isSystem: boolean;
  kind: "table" | "view";
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
  { label: "Views", value: "view" },
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

function uniqueSortedOptions(
  values: string[],
  getLabel: (value: string) => string = (value) => value
): FacetedFilterOption[] {
  return Array.from(new Set(values))
    .sort((left, right) => getLabel(left).localeCompare(getLabel(right)))
    .map((value) => ({ label: getLabel(value), value }));
}

function presentCatalogObjectKindOptions(objects: CatalogObjectFacetRow[]) {
  const presentKinds = new Set(objects.map((object) => object.kind));
  return CATALOG_OBJECT_KIND_OPTIONS.filter((option) =>
    presentKinds.has(option.value as CatalogObjectFacetRow["kind"])
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
  return objects.filter((object) => {
    if (kindFilters.length > 0 && !kindFilters.includes(object.kind)) {
      return false;
    }
    if (
      systemFilters.length > 0 &&
      !systemFilters.includes(catalogObjectSystemValue(object))
    ) {
      return false;
    }
    if (
      schemaFilters.length > 0 &&
      !schemaFilters.includes(schemaFilterValue(object))
    ) {
      return false;
    }
    if (
      ownerFilters.length > 0 &&
      !ownerFilters.includes(ownerFilterValue(object))
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
  return schemas.filter((schema) => {
    if (
      kindFilters.length > 0 &&
      !kindFilters.includes(catalogSchemaKindValue(schema))
    ) {
      return false;
    }
    if (
      ownerFilters.length > 0 &&
      !ownerFilters.includes(ownerFilterValue(schema))
    ) {
      return false;
    }
    return true;
  });
}

export type { CatalogObjectFacetRow, CatalogSchemaFacetRow };
export {
  filterCatalogObjectsByFacets,
  filterCatalogSchemasByFacets,
  presentCatalogObjectKindOptions,
  presentCatalogObjectOwnerOptions,
  presentCatalogObjectSchemaOptions,
  presentCatalogObjectSystemOptions,
  presentCatalogSchemaKindOptions,
  presentCatalogSchemaOwnerOptions,
};
