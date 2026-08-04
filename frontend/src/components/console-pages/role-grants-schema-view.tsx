"use client";

import { Database, FolderTree } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  GrantsType,
  GrantsView,
} from "@/components/console-pages/role-detail-search";
import {
  GrantedObjectsTable,
  RoleGrantsTableStatus,
} from "@/components/console-pages/role-grants-object-table";
import {
  ContentHead,
  GrantsEmptyState,
} from "@/components/console-pages/role-grants-pills";
import {
  dominantGrantor,
  grantObjectTypeFilterTokenForSlug,
  type SchemaGrantGroup,
  SLUG_TO_OBJECT_TYPE,
  slugForObjectType,
} from "@/components/console-pages/role-grants-shared";
import type {
  RoleGrantsTableSlice,
  SetRoleGrantsTableFilter,
} from "@/components/console-pages/role-grants-table-filter";
import { selectRoleGrantsTableSlice } from "@/components/console-pages/role-grants-table-filter";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildGrantFilter, SERVER_FILTER_DEBOUNCE_MS } from "@/lib/aip-filter";

function isGrantsType(slug: string): slug is GrantsType {
  return slug in SLUG_TO_OBJECT_TYPE;
}

function navigateSchemaGrantKind({
  onNavigate,
  routeSchema,
  slug,
}: {
  onNavigate: (next: GrantsView) => void;
  routeSchema: string;
  slug: string;
}) {
  if (slug === "all") {
    onNavigate({ kind: "schema", schema: routeSchema });
    return;
  }
  if (isGrantsType(slug)) {
    onNavigate({ kind: "schema", schema: routeSchema, type: slug });
  }
}

function SchemaGrantBody({
  activeKind,
  grantor,
  group,
  objects,
  onKindChange,
  partialTypeMissing,
  search,
  serverSlice,
  setSearch,
}: {
  activeKind: GrantsType | "all";
  grantor: string | null;
  group: SchemaGrantGroup;
  objects: SchemaGrantGroup["objects"];
  onKindChange: (slug: string) => void;
  partialTypeMissing: boolean;
  search: string;
  serverSlice?: RoleGrantsTableSlice | undefined;
  setSearch: (search: string) => void;
}) {
  if (partialTypeMissing) {
    return (
      <GrantsEmptyState title="Grant type results are incomplete">
        The requested grant type is not shown in the available direct grant
        results.
      </GrantsEmptyState>
    );
  }
  return (
    <>
      {grantor ? (
        <div className="-mt-3.5 pb-3.5 text-muted-foreground text-xs">
          granted by{" "}
          <span className="font-mono text-foreground/75">{grantor}</span>
        </div>
      ) : null}
      <RoleGrantsTableStatus
        error={serverSlice?.error ?? null}
        isPending={serverSlice?.isPending ?? false}
        partial={serverSlice?.partial ?? false}
      >
        <GrantedObjectsTable
          activeKind={activeKind}
          facetObjects={group.objects}
          objects={objects}
          onKindChange={onKindChange}
          onSearchChange={setSearch}
          search={search}
        />
      </RoleGrantsTableStatus>
    </>
  );
}

function resolveSchemaGrantSelection({
  allowMissingType = false,
  group,
  partial,
  type,
}: {
  allowMissingType?: boolean;
  group: SchemaGrantGroup;
  partial: boolean;
  type: GrantsType | undefined;
}) {
  const requestedType = type ? SLUG_TO_OBJECT_TYPE[type] : undefined;
  const partialTypeMissing = Boolean(
    partial &&
      !allowMissingType &&
      requestedType !== undefined &&
      !group.byType.has(requestedType)
  );
  const activeType =
    requestedType !== undefined &&
    (allowMissingType || group.byType.has(requestedType))
      ? requestedType
      : undefined;
  return {
    activeKind:
      activeType === undefined
        ? ("all" as const)
        : (slugForObjectType(activeType) ?? "all"),
    partialTypeMissing,
  };
}

function useSchemaGrantTableState({
  group,
  onTableFilterChange,
  partial,
  tableSlice,
  type,
}: {
  group: SchemaGrantGroup;
  onTableFilterChange?: SetRoleGrantsTableFilter | undefined;
  partial: boolean;
  tableSlice?: RoleGrantsTableSlice | undefined;
  type: GrantsType | undefined;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SERVER_FILTER_DEBOUNCE_MS);
  const selection = resolveSchemaGrantSelection({
    allowMissingType: Boolean(onTableFilterChange),
    group,
    partial,
    type,
  });
  const filter = buildGrantFilter({
    objectType: grantObjectTypeFilterTokenForSlug(selection.activeKind),
    schemaName: group.database ? "" : group.schema,
    search: debouncedSearch,
  });

  useEffect(
    function syncServerFilter() {
      if (filter) {
        onTableFilterChange?.({ filter, source: "direct" });
      }
    },
    [filter, onTableFilterChange]
  );

  const serverSlice = selectRoleGrantsTableSlice(tableSlice, "direct", filter);
  return {
    ...selection,
    search,
    serverSlice,
    setSearch,
    tableObjects: serverSlice?.grantObjects ?? group.objects,
  };
}

// A schema (or the synthetic database row) drill-in: one unified, sortable
// object table with kind tabs. The active tab is encoded in the URL via
// `grantsType` so the drill-in stays deep-linkable.
export function SchemaGrantsView({
  databaseName,
  group,
  onTableFilterChange,
  onNavigate,
  partial,
  tableSlice,
  type,
}: {
  databaseName: string | undefined;
  group: SchemaGrantGroup;
  onTableFilterChange?: SetRoleGrantsTableFilter | undefined;
  onNavigate: (next: GrantsView) => void;
  partial: boolean;
  tableSlice?: RoleGrantsTableSlice | undefined;
  type: GrantsType | undefined;
}) {
  const {
    activeKind,
    partialTypeMissing,
    search,
    serverSlice,
    setSearch,
    tableObjects,
  } = useSchemaGrantTableState({
    group,
    onTableFilterChange,
    partial,
    tableSlice,
    type,
  });
  const grantor = dominantGrantor(group.objects);
  const routeSchema = group.database
    ? (databaseName ?? group.schema)
    : group.schema;
  const handleKindChange = (slug: string) => {
    setSearch("");
    navigateSchemaGrantKind({ onNavigate, routeSchema, slug });
  };

  return (
    <div className="flex flex-col">
      <ContentHead
        count={group.total}
        countUnit="grant"
        icon={group.database ? Database : FolderTree}
        partial={partial}
        title={
          group.database ? (databaseName ?? "Database scope") : group.schema
        }
      />
      <SchemaGrantBody
        activeKind={activeKind}
        grantor={grantor}
        group={group}
        objects={tableObjects}
        onKindChange={handleKindChange}
        partialTypeMissing={partialTypeMissing}
        search={search}
        serverSlice={serverSlice}
        setSearch={setSearch}
      />
    </div>
  );
}
