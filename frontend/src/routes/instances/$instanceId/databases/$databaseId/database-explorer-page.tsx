import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useLayoutEffect } from "react";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isExplorerSearchNormalized,
  normalizeExplorerSearch,
} from "@/features/data-explorer/use-data-explorer-state";
import { ExplorerSidebarPortal } from "@/lib/explorer-sidebar-slot";
import { handleNavigationError } from "@/lib/navigation-errors";

const DataExplorerPage = lazy(() =>
  import("@/features/data-explorer/data-explorer-page").then((module) => ({
    default: module.DataExplorerPage,
  }))
);

function DatabaseExplorerLoadingShell() {
  // Mirrors the loaded layout: the object browser lives in the shared
  // sidebar rail (via the slot portal), the detail area fills the page.
  return (
    <>
      <ExplorerSidebarPortal>
        <div
          aria-label="Database objects"
          className="flex h-full min-h-0 flex-col"
          role="status"
        >
          <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
            <Skeleton className="h-8 rounded-md" />
            <Skeleton className="h-8 rounded-md" />
            <Skeleton className="h-8 rounded-md" />
          </div>
          <p className="px-3 py-6 text-center text-muted-foreground text-sm">
            Loading schemas…
          </p>
        </div>
      </ExplorerSidebarPortal>
      <section
        aria-label="Data Explorer"
        className="relative flex h-full min-w-0 flex-col overflow-hidden"
      >
        <div className="flex flex-1 items-center justify-center p-6">
          <BrandedLoadingState
            description="Preparing data explorer…"
            title="Data Explorer"
            variant="section"
          />
        </div>
      </section>
    </>
  );
}

export function DatabaseExplorerRoute() {
  const { databaseId, instanceId } = useParams({
    from: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  const search = useSearch({
    from: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  const navigate = useNavigate({
    from: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  const normalizedSearch = normalizeExplorerSearch(search);

  useLayoutEffect(
    function normalizeExplorerUrlSearch() {
      if (!isExplorerSearchNormalized(search)) {
        navigate({
          params: { databaseId, instanceId },
          replace: true,
          search: () => normalizedSearch,
        }).catch((error: unknown) =>
          handleNavigationError(error, {
            area: "data-explorer.normalize-search",
          })
        );
      }
    },
    [databaseId, instanceId, navigate, normalizedSearch, search]
  );

  return (
    <Suspense fallback={<DatabaseExplorerLoadingShell />}>
      <DataExplorerPage
        databaseId={databaseId}
        instanceId={instanceId}
        search={normalizedSearch}
      />
    </Suspense>
  );
}

export { DatabaseExplorerLoadingShell };
