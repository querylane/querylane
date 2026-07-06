"use client";

import { lazy, Suspense } from "react";
import type { CategoryKey } from "@/features/data-explorer/data-explorer-types";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import type { TableDetailTab } from "@/features/data-explorer/table-detail-tab";
import type { Table } from "@/protogen/querylane/console/v1alpha1/table_pb";
import type { View } from "@/protogen/querylane/console/v1alpha1/view_pb";

const TableDetail = lazy(() =>
  import("@/features/data-explorer/explorer-table-detail").then((module) => ({
    default: module.TableDetail,
  }))
);

function TableDetailLoadingFallback({
  schemaName,
  tableName,
}: {
  schemaName: string;
  tableName: string;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="size-10 shrink-0 rounded-lg bg-primary/10"
        />
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Table
          </p>
          <h1
            aria-label={`${schemaName}.${tableName}`}
            className="truncate font-mono font-semibold text-xl"
            title={`${schemaName}.${tableName}`}
          >
            <span className="text-muted-foreground">{schemaName}.</span>
            {tableName}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            Loading table details…
          </p>
        </div>
      </div>
    </header>
  );
}

export function ResourceDetail({
  category,
  databaseId,
  instanceId,
  name,
  onOpenReferencedTable,
  onTableTabChange,
  schemaName,
  table,
  tableTab,
  view,
}: {
  category: CategoryKey;
  databaseId: string;
  instanceId: string;
  name: string;
  onOpenReferencedTable?: ((tableName: string) => void) | undefined;
  onTableTabChange: (tab: TableDetailTab) => void;
  schemaName: string;
  table: Table | undefined;
  tableTab: string | undefined;
  view: View | undefined;
}) {
  if (category === "tables") {
    return (
      <Suspense
        fallback={
          <TableDetailLoadingFallback
            schemaName={schemaName}
            tableName={name}
          />
        }
      >
        <TableDetail
          databaseId={databaseId}
          initialTab={tableTab}
          instanceId={instanceId}
          onOpenReferencedTable={onOpenReferencedTable}
          onTabChange={onTableTabChange}
          schemaName={schemaName}
          table={table}
          tableName={name}
        />
      </Suspense>
    );
  }
  if (category === "views") {
    return <ViewDetail view={view} viewName={name} />;
  }
  return null;
}

export { TableDetailLoadingFallback };
