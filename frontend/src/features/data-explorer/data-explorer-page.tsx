"use client";

import { ResourcePageState } from "@/components/console-pages/console-layout";
import { useSidebar } from "@/components/querylane-ui/sidebar";
import { ExplorerDetailPane } from "@/features/data-explorer/data-explorer-layout";
import { useDataExplorerPageController } from "@/features/data-explorer/data-explorer-page-controller";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import { ExplorerSidebar } from "@/features/data-explorer/explorer-sidebar";
import { ExplorerSidebarPortal } from "@/lib/explorer-sidebar-slot";

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
  const { isMobile, setOpenMobile } = useSidebar();
  // On phones the shared rail renders as a sheet; close it after a pick so
  // the selected object's detail is visible immediately.
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
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
    onSelectResource: (
      category: Parameters<typeof explorer.onSelectResource>[0],
      name: string
    ) => {
      explorer.onSelectResource(category, name);
      closeMobileSidebar();
    },
    onSelectSchema: (schema: Parameters<typeof explorer.onSelectSchema>[0]) => {
      explorer.onSelectSchema(schema);
      closeMobileSidebar();
    },
    onSelectSchemaOverview: () => {
      explorer.onSelectSchemaOverview();
      closeMobileSidebar();
    },
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
    tablesError: explorer.tablesError,
    tablesSyncNotice: explorer.tablesSyncNotice,
    viewsError: explorer.viewsError,
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
  const handleSelectResource = explorer.onSelectResource;
  const handleSchemaTabChange = explorer.onSchemaTabChange;
  const handleSelectTableInSchema = explorer.onSelectTableInSchema;
  const handleTableTabChange = explorer.onTableTabChange;
  const detailPane = (
    <ExplorerDetailPane
      activeSchema={explorer.activeSchema}
      databaseId={explorer.databaseId}
      hasMoreTables={explorer.schemaOverview.hasMoreTables}
      hasMoreViews={explorer.schemaOverview.hasMoreViews}
      instanceId={explorer.instanceId}
      onSchemaTabChange={handleSchemaTabChange}
      onSelectResource={handleSelectResource}
      onSelectTableInSchema={handleSelectTableInSchema}
      onTableTabChange={handleTableTabChange}
      overviewTables={explorer.schemaOverview.rawTables}
      overviewViews={explorer.schemaOverview.rawViews}
      rawTables={explorer.rawTables}
      rawViews={explorer.rawViews}
      schemas={explorer.schemas}
      schemaTab={explorer.schemaTab}
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

  // Schema listing failed with nothing cached: the detail area shows the
  // retryable error, so an object browser claiming "No schemas" would lie.
  const schemasFailed =
    Boolean(explorer.schemaPageStateProps.error) &&
    !explorer.schemaPageStateProps.hasData;

  // The object browser renders inside the shared sidebar rail via the slot
  // portal, outside ResourcePageState on purpose: while schemas load the rail
  // shows the tree's own skeletons instead of a blank panel.
  return (
    <>
      <ExplorerSidebarPortal>
        {schemasFailed ? null : <ExplorerSidebar {...sidebarProps} />}
      </ExplorerSidebarPortal>
      <ResourcePageState {...schemaPageStateProps} title="Loading explorer">
        {/*
          Full-bleed detail pane: the object header and tab bar stay pinned
          while each tab panel scrolls on its own, so the section itself must
          not scroll. Padding is owned by the individual panels.
        */}
        <section
          aria-label="Data Explorer details"
          className="relative flex h-full min-w-0 flex-col overflow-hidden"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {detailPane}
          </div>
        </section>
      </ResourcePageState>
    </>
  );
}

export { DataExplorerPage };
