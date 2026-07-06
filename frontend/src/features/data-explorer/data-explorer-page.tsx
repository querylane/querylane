"use client";

import { PanelLeftIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { ResourcePageState } from "@/components/console-pages/console-layout";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ExplorerDetailPane } from "@/features/data-explorer/data-explorer-layout";
import { useDataExplorerPageController } from "@/features/data-explorer/data-explorer-page-controller";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import { ExplorerSidebar } from "@/features/data-explorer/explorer-sidebar";
import { cn } from "@/lib/utils";

const OBJECT_BROWSER_DOCKED_QUERY = "(min-width: 1280px)";
// react-resizable-panels treats numeric sizes as pixels, so keep units explicit.
const OBJECT_BROWSER_DEFAULT_WIDTH = "20rem";
const OBJECT_BROWSER_MIN_WIDTH = "12rem";
const OBJECT_BROWSER_MAX_WIDTH = "48rem";
const DETAIL_PANE_MIN_WIDTH = "20rem";

function getObjectBrowserDockedSnapshot() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(OBJECT_BROWSER_DOCKED_QUERY).matches;
}

function subscribeObjectBrowserDocking(onStoreChange: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const mediaQuery = window.matchMedia(OBJECT_BROWSER_DOCKED_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function useObjectBrowserDocked() {
  return useSyncExternalStore(
    subscribeObjectBrowserDocking,
    getObjectBrowserDockedSnapshot,
    () => false
  );
}

function DataExplorerPage({
  databaseId,
  instanceId,
  search,
}: {
  databaseId: string;
  instanceId: string;
  search: DataExplorerSearch;
}) {
  const explorer = useDataExplorerPageController({
    databaseId,
    instanceId,
    search,
  });
  const [isObjectBrowserOpen, setIsObjectBrowserOpen] = useState(false);
  const isObjectBrowserDocked = useObjectBrowserDocked();
  const closeObjectBrowser = () => setIsObjectBrowserOpen(false);
  const sidebarProps = {
    activeSchema: explorer.activeSchema,
    categoryPagination: {
      schemas: explorer.schemasPagination,
      tables: explorer.tablesPagination,
      views: explorer.viewsPagination,
    },
    databaseLabel: explorer.databaseLabel,
    expandedCategories: explorer.expandedCategories,
    itemsByCategory: explorer.itemsByCategory,
    onLoadMoreCategory: explorer.onLoadMoreCategory,
    onLoadMoreSchemas: explorer.onLoadMoreSchemas,
    onResourceIntent: explorer.onResourceIntent,
    onRetryTables: explorer.onRetryTables,
    onRetryViews: explorer.onRetryViews,
    onSelectResource: explorer.onSelectResource,
    onSelectSchema: explorer.onSelectSchema,
    onSelectSchemaOverview: explorer.onSelectSchemaOverview,
    onTableListSortChange: explorer.onTableListSortChange,
    query: explorer.query,
    schemaSelectionError: explorer.schemaSelectionError,
    schemas: explorer.schemas,
    schemasLoading:
      explorer.schemaPageStateProps.loading &&
      !explorer.schemaPageStateProps.hasData,
    schemasSyncNotice: explorer.schemasSyncNotice,
    selection: explorer.selection,
    setExpandedCategories: explorer.setExpandedCategories,
    setQuery: explorer.setQuery,
    tableListSort: explorer.tableListSort,
    tablesError: explorer.tablesError,
    tablesSyncNotice: explorer.tablesSyncNotice,
    viewsError: explorer.viewsError,
  };
  const mobileSidebarProps = {
    ...sidebarProps,
    onSelectResource: (
      category: Parameters<typeof explorer.onSelectResource>[0],
      name: string
    ) => {
      explorer.onSelectResource(category, name);
      closeObjectBrowser();
    },
    onSelectSchema: (schema: Parameters<typeof explorer.onSelectSchema>[0]) => {
      explorer.onSelectSchema(schema);
      closeObjectBrowser();
    },
    onSelectSchemaOverview: () => {
      explorer.onSelectSchemaOverview();
      closeObjectBrowser();
    },
  };
  const showShellWhileSchemasLoad =
    explorer.schemaPageStateProps.loading &&
    !explorer.schemaPageStateProps.hasData &&
    !explorer.schemaPageStateProps.error;
  const schemaPageStateProps = showShellWhileSchemasLoad
    ? {
        ...explorer.schemaPageStateProps,
        hasData: true,
        loading: false,
      }
    : explorer.schemaPageStateProps;
  const isTableResource =
    explorer.selection.kind === "resource" &&
    explorer.selection.category === "tables";
  const handleSelectResource = explorer.onSelectResource;
  const handleTableTabChange = explorer.onTableTabChange;
  const detailPane = (
    <ExplorerDetailPane
      activeSchema={explorer.activeSchema}
      databaseId={explorer.databaseId}
      hasMoreTables={explorer.schemaOverview.hasMoreTables}
      hasMoreViews={explorer.schemaOverview.hasMoreViews}
      instanceId={explorer.instanceId}
      onSelectResource={handleSelectResource}
      onTableTabChange={handleTableTabChange}
      overviewTables={explorer.schemaOverview.rawTables}
      overviewViews={explorer.schemaOverview.rawViews}
      rawTables={explorer.rawTables}
      rawViews={explorer.rawViews}
      selectedResourceError={explorer.selectedResourceError}
      selection={explorer.selection}
      tablesError={explorer.schemaOverview.tablesError}
      tablesLoading={explorer.schemaOverview.tablesLoading}
      tablesSyncNotice={explorer.schemaOverview.tablesSyncNotice}
      tableTab={explorer.tableTab}
      viewsError={explorer.schemaOverview.viewsError}
      viewsLoading={explorer.schemaOverview.viewsLoading}
    />
  );
  const detailContent = (
    <div
      className={cn(
        "min-w-0",
        isTableResource
          ? "flex min-h-0 w-full flex-1 flex-col p-3 sm:p-4 lg:p-6"
          : "mx-auto max-w-[900px] p-4 sm:p-6 lg:p-8"
      )}
    >
      {detailPane}
    </div>
  );
  const explorerBody = (
    <div
      className={cn(
        "w-full",
        isTableResource && "flex h-full min-h-0 flex-col"
      )}
    >
      {isObjectBrowserDocked ? null : (
        <div className="flex flex-wrap items-center gap-3 p-3 pb-0 sm:p-4 sm:pb-0 lg:p-6 lg:pb-0">
          <Button
            onClick={() => setIsObjectBrowserOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <PanelLeftIcon className="size-4" />
            Open object browser
          </Button>
        </div>
      )}
      {detailContent}
    </div>
  );

  return (
    <ResourcePageState {...schemaPageStateProps} title="Loading explorer">
      {isObjectBrowserDocked ? (
        <ResizablePanelGroup
          className="min-w-0 overflow-hidden"
          orientation="horizontal"
          resizeTargetMinimumSize={{ coarse: 36, fine: 16 }}
        >
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize={OBJECT_BROWSER_DEFAULT_WIDTH}
            groupResizeBehavior="preserve-pixel-size"
            maxSize={OBJECT_BROWSER_MAX_WIDTH}
            minSize={OBJECT_BROWSER_MIN_WIDTH}
          >
            <ExplorerSidebar
              {...sidebarProps}
              className="h-full w-full min-w-0 max-w-full border-r-0"
            />
          </ResizablePanel>
          <ResizableHandle
            className="w-4 cursor-col-resize after:w-4"
            withHandle={true}
          />
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            minSize={DETAIL_PANE_MIN_WIDTH}
          >
            <section
              aria-label="Data Explorer details"
              className="relative h-full min-w-0 overflow-auto"
            >
              {explorerBody}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full min-w-0 overflow-hidden">
          <ExplorerSidebar {...sidebarProps} className="hidden xl:flex" />

          <section
            aria-label="Data Explorer details"
            className="relative min-w-0 flex-1 overflow-auto"
          >
            {explorerBody}
            <Sheet
              onOpenChange={setIsObjectBrowserOpen}
              open={isObjectBrowserOpen}
            >
              <SheetContent
                className="w-[min(20rem,calc(100vw-1rem))] gap-0 bg-background p-0"
                side="left"
                style={{
                  maxWidth: "none",
                  width: "min(20rem, calc(100vw - 1rem))",
                }}
              >
                <SheetHeader className="border-b">
                  <SheetTitle>Database objects</SheetTitle>
                  <SheetDescription>
                    Browse schemas, tables, and views.
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ExplorerSidebar
                    {...mobileSidebarProps}
                    className="h-full w-full border-r-0 bg-sidebar"
                  />
                </div>
              </SheetContent>
            </Sheet>
          </section>
        </div>
      )}
    </ResourcePageState>
  );
}

export { DataExplorerPage };
