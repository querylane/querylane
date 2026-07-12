"use client";

import type React from "react";
import type {
  CategoryKey,
  ResourceItem,
} from "@/features/data-explorer/data-explorer-types";
import { formatBytes } from "@/lib/console-resources";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { View_ViewType } from "@/protogen/querylane/console/v1alpha1/view_pb";

export interface SchemaSummary {
  id: string;
  name: string;
  owner: string;
}
export interface TableSummary {
  id: string;
  name: string;
  rowCount: bigint;
  sizeBytes: bigint;
  type: Table_TableType;
}
export interface ViewSummary {
  id: string;
  name: string;
  rowCount: bigint;
  sizeBytes: bigint;
  type: View_ViewType;
}

export function pickDefaultSchema(
  schemas: SchemaSummary[]
): SchemaSummary | null {
  if (schemas.length === 0) {
    return null;
  }
  const publicSchema = schemas.find((schema) => schema.name === "public");
  return publicSchema ?? schemas[0] ?? null;
}
export function matchesQuery(name: string, query: string): boolean {
  if (!query) {
    return true;
  }
  return name.toLowerCase().includes(query.toLowerCase());
}
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) {
    return text;
  }
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-200/40 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
export function getItemsForCategory(
  category: CategoryKey,
  tables: TableSummary[],
  views: ViewSummary[]
): ResourceItem[] {
  switch (category) {
    case "tables":
      return tables.map((table) => {
        const isPartitioned = table.type === Table_TableType.PARTITIONED;
        return {
          badge: isPartitioned
            ? { label: "part", tone: "violet" as const }
            : undefined,
          name: table.name,
          objectType: isPartitioned ? ("partitioned" as const) : "table",
          sizeLabel: formatBytes(table.sizeBytes),
        };
      });
    case "views":
      return views.map((view) => {
        const isMaterialized = view.type === View_ViewType.MATERIALIZED;
        return {
          badge: isMaterialized
            ? { label: "mat", tone: "violet" as const }
            : undefined,
          name: view.name,
          objectType: isMaterialized ? ("materialized" as const) : "view",
        };
      });
    default:
      return [];
  }
}
