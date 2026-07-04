import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";

type ExtensionStatusFilter = "available" | "installed";

const NO_EXTENSION_SCHEMA_FILTER_VALUE = "__no_schema__";

const EXTENSION_STATUS_LABELS = {
  available: "Available",
  installed: "Installed",
} satisfies Record<ExtensionStatusFilter, string>;

function extensionStatusFilterValue(
  extension: Extension
): ExtensionStatusFilter {
  return extension.installed ? "installed" : "available";
}

function extensionSchemaFilterValue(extension: Extension): string {
  return extension.schema || NO_EXTENSION_SCHEMA_FILTER_VALUE;
}

function filterExtensionsByFacets({
  extensions,
  schemaFilters,
  statusFilters,
}: {
  extensions: Extension[];
  schemaFilters: string[];
  statusFilters: string[];
}) {
  return extensions.filter((extension) => {
    if (
      statusFilters.length > 0 &&
      !statusFilters.includes(extensionStatusFilterValue(extension))
    ) {
      return false;
    }
    if (
      schemaFilters.length > 0 &&
      !schemaFilters.includes(extensionSchemaFilterValue(extension))
    ) {
      return false;
    }
    return true;
  });
}

function presentExtensionStatusOptions(
  extensions: Extension[]
): FacetedFilterOption[] {
  const present = new Set(extensions.map(extensionStatusFilterValue));
  const options: FacetedFilterOption[] = [];
  for (const value of [
    "installed",
    "available",
  ] satisfies ExtensionStatusFilter[]) {
    if (present.has(value)) {
      options.push({ label: EXTENSION_STATUS_LABELS[value], value });
    }
  }
  return options;
}

function presentExtensionSchemaOptions(
  extensions: Extension[]
): FacetedFilterOption[] {
  const schemas = new Set<string>();
  let hasNoSchema = false;

  for (const extension of extensions) {
    if (extension.schema) {
      schemas.add(extension.schema);
    } else {
      hasNoSchema = true;
    }
  }

  const options = Array.from(schemas)
    .sort((left, right) => left.localeCompare(right))
    .map((schema) => ({ label: schema, value: schema }));

  if (hasNoSchema) {
    options.push({
      label: "No schema",
      value: NO_EXTENSION_SCHEMA_FILTER_VALUE,
    });
  }

  return options;
}

export {
  filterExtensionsByFacets,
  presentExtensionSchemaOptions,
  presentExtensionStatusOptions,
};
