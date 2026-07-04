import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useLayoutEffect } from "react";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import {
  isExplorerSearchNormalized,
  normalizeExplorerSearch,
} from "@/features/data-explorer/use-data-explorer-state";
import { handleNavigationError } from "@/lib/navigation-errors";

const DataExplorerPage = lazy(() =>
  import("@/features/data-explorer/data-explorer-page").then((module) => ({
    default: module.DataExplorerPage,
  }))
);

function DatabaseExplorerLoadingShell() {
  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <aside
        aria-label="Database objects"
        className="hidden w-[300px] shrink-0 flex-col border-border border-r bg-sidebar/40 xl:flex"
      >
        <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
          <div className="h-8 rounded-md bg-muted" />
          <div className="h-8 rounded-md border bg-card" />
          <div className="h-8 rounded-md bg-muted/70" />
        </div>
        <div className="flex-1 p-2">
          <p className="px-3 py-6 text-center text-muted-foreground text-sm">
            Loading schemas…
          </p>
        </div>
      </aside>
      <section
        aria-label="Data Explorer"
        className="relative min-w-0 flex-1 overflow-auto"
      >
        <div className="mx-auto max-w-[900px] p-4 sm:p-6 lg:p-8">
          <BrandedLoadingState
            description="Preparing data explorer…"
            title="Data Explorer"
            variant="section"
          />
        </div>
      </section>
    </div>
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
