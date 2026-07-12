"use client";

import { lazy, Suspense } from "react";
import type { AdminPageId, InstanceLayoutSearch } from "@/lib/admin-page";

const BackendDatabasePage = lazy(() =>
  import("@/components/console-pages/database-page").then((module) => ({
    default: module.BackendDatabasePage,
  }))
);
const BackendDatabaseExtensionsPage = lazy(() =>
  import("@/components/console-pages/database-extensions-page").then(
    (module) => ({
      default: module.BackendDatabaseExtensionsPage,
    })
  )
);
const BackendInstancePage = lazy(() =>
  import("@/components/console-pages/instance-page").then((module) => ({
    default: module.BackendInstancePage,
  }))
);
const DataExplorerPage = lazy(() =>
  import("@/features/data-explorer/data-explorer-page").then((module) => ({
    default: module.DataExplorerPage,
  }))
);
const SqlWorkbenchPage = lazy(() =>
  import("@/features/sql-workbench/sql-workbench-page").then((module) => ({
    default: module.SqlWorkbenchPage,
  }))
);
const InstanceRolesPage = lazy(() =>
  import("@/components/console-pages/instance-roles-page").then((module) => ({
    default: module.InstanceRolesPage,
  }))
);

interface RouteIds {
  databaseId?: string;
  instanceId?: string;
}

interface AdminPageRendererProps {
  page: AdminPageId;
  routeIds: RouteIds;
  search: InstanceLayoutSearch;
}

function AdminPageFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="h-4 w-full max-w-xl rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 rounded-xl border bg-card" />
        <div className="h-28 rounded-xl border bg-card" />
        <div className="h-28 rounded-xl border bg-card" />
      </div>
      <span className="sr-only">Loading page content</span>
    </div>
  );
}

function InstanceAdminPageContent({
  instanceId,
  page,
}: {
  instanceId: string | undefined;
  page: AdminPageId;
}) {
  if (!instanceId) {
    return null;
  }
  switch (page) {
    case "instance.activity":
      return <BackendInstancePage instanceId={instanceId} section="activity" />;
    case "instance.overview":
      return <BackendInstancePage instanceId={instanceId} section="overview" />;
    case "instance.roles":
      return <InstanceRolesPage instanceId={instanceId} />;
    case "instance.configuration":
      return (
        <BackendInstancePage instanceId={instanceId} section="configuration" />
      );
    default:
      return null;
  }
}

function DatabaseAdminPageContent({
  databaseId,
  instanceId,
  page,
  search,
}: {
  databaseId: string | undefined;
  instanceId: string | undefined;
  page: AdminPageId;
  search: InstanceLayoutSearch;
}) {
  if (!(instanceId && databaseId)) {
    return null;
  }

  switch (page) {
    case "database.overview":
      return (
        <BackendDatabasePage
          databaseId={databaseId}
          instanceId={instanceId}
          section="overview"
        />
      );
    case "database.extensions":
      return (
        <BackendDatabaseExtensionsPage
          databaseId={databaseId}
          instanceId={instanceId}
        />
      );
    case "database.workbench":
      return (
        <SqlWorkbenchPage databaseId={databaseId} instanceId={instanceId} />
      );
    case "database.explorer":
      return (
        <DataExplorerPage
          databaseId={databaseId}
          instanceId={instanceId}
          search={{
            category: search.category,
            name: search.name,
            schema: search.schema,
          }}
        />
      );
    default:
      return null;
  }
}

function AdminPageContent({ page, routeIds, search }: AdminPageRendererProps) {
  if (page.startsWith("instance.")) {
    return (
      <InstanceAdminPageContent instanceId={routeIds.instanceId} page={page} />
    );
  }

  return (
    <DatabaseAdminPageContent
      databaseId={routeIds.databaseId}
      instanceId={routeIds.instanceId}
      page={page}
      search={search}
    />
  );
}

export function AdminPageRenderer(props: AdminPageRendererProps) {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <AdminPageContent {...props} />
    </Suspense>
  );
}
