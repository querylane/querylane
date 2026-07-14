"use client";

import { lazy, Suspense } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const DatabaseQueryInsightsContent = lazy(() =>
  import("@/components/console-pages/database-query-insights-content").then(
    (module) => ({ default: module.DatabaseQueryInsightsContent })
  )
);

function QueryInsightsDrawerFallback() {
  return (
    <div className="grid gap-4">
      <div className="h-80 rounded-xl border bg-card" />
      <div className="h-48 rounded-xl border bg-card" />
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
        className="!w-screen !max-w-none sm:!w-[80vw] sm:!max-w-5xl gap-0 overflow-hidden p-0"
        side="right"
      >
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-14">
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
