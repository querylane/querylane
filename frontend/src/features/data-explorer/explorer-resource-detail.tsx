"use client";

import { Table2 } from "lucide-react";
import { lazy, Suspense } from "react";
import type { CategoryKey } from "@/features/data-explorer/data-explorer-types";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import { ObjectDetailHeader } from "@/features/data-explorer/object-detail-chrome";
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
  // Mirrors the loaded TableDetailHeader so the header doesn't jump when the
  // lazy chunk resolves.
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ObjectDetailHeader
        icon={Table2}
        iconClassName="bg-primary/10 text-primary"
        subtitle="Loading table details…"
        title={tableName}
        titleAriaLabel={`${schemaName}.${tableName}`}
        titlePrefix={`${schemaName}.`}
      />
    </div>
  );
}

export function ResourceDetail({
  category,
  databaseId,
  instanceId,
  name,
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
          onTabChange={onTableTabChange}
          schemaName={schemaName}
          table={table}
          tableName={name}
        />
      </Suspense>
    );
  }
  if (category === "views") {
    return <ViewDetail schemaName={schemaName} view={view} viewName={name} />;
  }
  return null;
}

export { TableDetailLoadingFallback };
