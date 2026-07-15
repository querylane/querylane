import {
  matchesNameFilter,
  resourceDisplayName,
} from "@/features/data-explorer/data-explorer-catalog-filter";
import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import type { selectionFromSearch } from "@/features/data-explorer/use-data-explorer-state";
import { buildTableName, buildViewName } from "@/lib/console-resources";

type ExplorerSelection = ReturnType<typeof selectionFromSearch>;

function selectedTableName(
  selection: ExplorerSelection,
  selectedResourceName: string | undefined
) {
  return selection.kind === "resource" && selection.category === "tables"
    ? selectedResourceName
    : undefined;
}

function selectedViewName(
  selection: ExplorerSelection,
  selectedResourceName: string | undefined
) {
  return selection.kind === "resource" && selection.category === "views"
    ? selectedResourceName
    : undefined;
}

function selectedResourceQueryError({
  selectedTableError,
  selectedViewError,
  selection,
}: {
  selectedTableError: unknown;
  selectedViewError: unknown;
  selection: ExplorerSelection;
}) {
  if (selection.kind !== "resource") {
    return;
  }
  return selection.category === "tables"
    ? selectedTableError
    : selectedViewError;
}

function buildSelectedResourceName({
  activeSchema,
  databaseId,
  instanceId,
  selection,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  instanceId: string;
  selection: ExplorerSelection;
}): string | undefined {
  if (!(activeSchema && selection.kind === "resource")) {
    return;
  }
  if (selection.category === "tables") {
    return buildTableName({
      instanceId,
      databaseId,
      schemaId: activeSchema.id,
      tableId: selection.name,
    });
  }
  return buildViewName({
    instanceId,
    databaseId,
    schemaId: activeSchema.id,
    viewId: selection.name,
  });
}

function injectSelectedResource<
  T extends { displayName?: string; name: string },
>(resources: T[], selected: T | undefined, query: string): T[] {
  if (
    !(selected && matchesNameFilter(resourceDisplayName(selected), query)) ||
    resources.some((resource) => resource.name === selected.name)
  ) {
    return resources;
  }
  return [...resources, selected].sort((left, right) =>
    resourceDisplayName(left).localeCompare(resourceDisplayName(right))
  );
}

export {
  buildSelectedResourceName,
  injectSelectedResource,
  selectedResourceQueryError,
  selectedTableName,
  selectedViewName,
};
