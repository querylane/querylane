"use client";

import { lazy, Suspense } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/querylane-ui/sheet";

const DatabaseQueryInsightsContent = lazy(() =>
  import("@/components/console-pages/database-query-insights-content").then(
    (module) => ({ default: module.DatabaseQueryInsightsContent })
  )
);

function QueryInsightsDrawerFallback() {
  return (
    <div className="grid gap-4">
      <div className="bg-card h-80 rounded-xl border" />
      <div className="bg-card h-48 rounded-xl border" />
      <span className="sr-only">Loading query insights</span>
    </div>
  );
}

function DatabaseQueryInsightsDrawer({
  databaseId,
  instanceId,
  onOpenChange,
  open,
}: {
  databaseId: string;
  instanceId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="!w-full !max-w-none overflow-hidden sm:!w-[80vw] sm:!max-w-5xl"
        presentation="detail"
        side="right"
      >
        <SheetHeader className="shrink-0" presentation="drawer">
          <SheetTitle>Query insights</SheetTitle>
          <SheetDescription>
            PostgreSQL query and table statistics for this database.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {open ? (
            <Suspense fallback={<QueryInsightsDrawerFallback />}>
              <DatabaseQueryInsightsContent
                databaseId={databaseId}
                instanceId={instanceId}
              />
            </Suspense>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { DatabaseQueryInsightsDrawer };
