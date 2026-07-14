"use client";

import { Database, FolderTree } from "lucide-react";
import { useState } from "react";
import type {
  GrantsType,
  GrantsView,
} from "@/components/console-pages/role-detail-search";
import { GrantedObjectsTable } from "@/components/console-pages/role-grants-object-table";
import {
  ContentHead,
  GrantsEmptyState,
} from "@/components/console-pages/role-grants-pills";
import {
  dominantGrantor,
  type SchemaGrantGroup,
  SLUG_TO_OBJECT_TYPE,
  slugForObjectType,
} from "@/components/console-pages/role-grants-shared";

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
  onKindChange,
  partialTypeMissing,
  search,
  setSearch,
}: {
  activeKind: GrantsType | "all";
  grantor: string | null;
  group: SchemaGrantGroup;
  onKindChange: (slug: string) => void;
  partialTypeMissing: boolean;
  search: string;
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
      <GrantedObjectsTable
        activeKind={activeKind}
        objects={group.objects}
        onKindChange={onKindChange}
        onSearchChange={setSearch}
        search={search}
      />
    </>
  );
}

function resolveSchemaGrantSelection(
  group: SchemaGrantGroup,
  type: GrantsType | undefined,
  partial: boolean
) {
  const requestedType = type ? SLUG_TO_OBJECT_TYPE[type] : undefined;
  const partialTypeMissing = Boolean(
    partial && requestedType !== undefined && !group.byType.has(requestedType)
  );
  const activeType =
    requestedType !== undefined && group.byType.has(requestedType)
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

// A schema (or the synthetic database row) drill-in: one unified, sortable
// object table with kind tabs. The active tab is encoded in the URL via
// `grantsType` so the drill-in stays deep-linkable.
export function SchemaGrantsView({
  databaseName,
  group,
  onNavigate,
  partial,
  type,
}: {
  databaseName: string | undefined;
  group: SchemaGrantGroup;
  onNavigate: (next: GrantsView) => void;
  partial: boolean;
  type: GrantsType | undefined;
}) {
  const [search, setSearch] = useState("");
  // Ignore a type that isn't present in this schema (e.g. a stale deep link).
  const { activeKind, partialTypeMissing } = resolveSchemaGrantSelection(
    group,
    type,
    partial
  );
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
        onKindChange={handleKindChange}
        partialTypeMissing={partialTypeMissing}
        search={search}
        setSearch={setSearch}
      />
    </div>
  );
}
