"use client";

import { Database, FolderTree } from "lucide-react";
import { useState } from "react";
import type {
  GrantsType,
  GrantsView,
} from "@/components/console-pages/role-detail-search";
import { GrantedObjectsTable } from "@/components/console-pages/role-grants-object-table";
import { ContentHead } from "@/components/console-pages/role-grants-pills";
import {
  dominantGrantor,
  type SchemaGrantGroup,
  SLUG_TO_OBJECT_TYPE,
  slugForObjectType,
} from "@/components/console-pages/role-grants-shared";

function isGrantsType(slug: string): slug is GrantsType {
  return slug in SLUG_TO_OBJECT_TYPE;
}

// A schema (or the synthetic database row) drill-in: one unified, sortable
// object table with kind tabs. The active tab is encoded in the URL via
// `grantsType` so the drill-in stays deep-linkable.
export function SchemaGrantsView({
  databaseName,
  group,
  onNavigate,
  type,
}: {
  databaseName: string | undefined;
  group: SchemaGrantGroup;
  onNavigate: (next: GrantsView) => void;
  type: GrantsType | undefined;
}) {
  const [search, setSearch] = useState("");
  // Ignore a type that isn't present in this schema (e.g. a stale deep link).
  const requestedType = type ? SLUG_TO_OBJECT_TYPE[type] : undefined;
  const activeType =
    requestedType != null && group.byType.has(requestedType)
      ? requestedType
      : undefined;
  const activeKind =
    activeType == null ? "all" : (slugForObjectType(activeType) ?? "all");
  const grantor = dominantGrantor(group.objects);
  const routeSchema = group.database
    ? (databaseName ?? group.schema)
    : group.schema;

  return (
    <div className="flex flex-col">
      <ContentHead
        count={group.total}
        countUnit="grant"
        icon={group.database ? Database : FolderTree}
        sub={
          grantor ? (
            <span>
              granted by{" "}
              <span className="font-mono text-foreground/75">{grantor}</span>
            </span>
          ) : undefined
        }
        title={
          group.database ? (databaseName ?? "Database scope") : group.schema
        }
      />
      <GrantedObjectsTable
        activeKind={activeKind}
        objects={group.objects}
        onKindChange={(slug) => {
          setSearch("");
          if (slug === "all") {
            onNavigate({ kind: "schema", schema: routeSchema });
            return;
          }
          if (isGrantsType(slug)) {
            onNavigate({
              kind: "schema",
              schema: routeSchema,
              type: slug,
            });
          }
        }}
        onSearchChange={setSearch}
        search={search}
      />
    </div>
  );
}
