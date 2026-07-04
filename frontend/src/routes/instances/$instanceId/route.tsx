import {
  createFileRoute,
  Outlet,
  redirect,
  retainSearchParams,
  useMatches,
} from "@tanstack/react-router";

import { AdminPageRenderer } from "@/components/admin-page-renderer";
import { DatabaseLayout } from "@/components/database-layout";
import { NotFoundState } from "@/components/not-found-state";
import { resolveLegacyAdminPageRedirect } from "@/lib/admin-navigation";
import {
  instanceLayoutSearchSchema,
  PAGE_SEARCH_KEYS,
  resolveImplicitAdminPageFromRouteId,
  resolveRequestedAdminPageForScope,
} from "@/lib/admin-page";
import { resolveScopeLevel } from "@/lib/admin-scope-level";
import {
  instanceRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";
import { parseRouteIdsFromPathname, useCurrentRouteIds } from "@/lib/route-ids";
import { InstanceLayoutErrorComponent } from "@/routes/instances/$instanceId/instance-layout-error";

function InstanceLayoutRoute() {
  const search = Route.useSearch();
  const routeIds = useCurrentRouteIds();
  const requestedPage = search.page
    ? resolveRequestedAdminPageForScope(
        search.page,
        resolveScopeLevel(routeIds)
      )
    : undefined;
  const matchedPage = useMatches({
    select: (matches) =>
      resolveImplicitAdminPageFromRouteId(matches.at(-1)?.routeId),
  });
  const layoutPage = requestedPage ?? matchedPage;

  return (
    <DatabaseLayout {...(layoutPage === undefined ? {} : { page: layoutPage })}>
      {requestedPage ? (
        <AdminPageRenderer
          page={requestedPage}
          routeIds={routeIds}
          search={search}
        />
      ) : (
        <Outlet />
      )}
    </DatabaseLayout>
  );
}

function InstanceNotFoundComponent() {
  return <NotFoundState containerClassName="min-h-[60vh]" />;
}

export const Route = createFileRoute("/instances/$instanceId")({
  beforeLoad: ({ location, search }) => {
    const routeIds = parseRouteIdsFromPathname(location.pathname);
    const page = resolveRequestedAdminPageForScope(
      search.page,
      resolveScopeLevel(routeIds)
    );
    const legacyRedirect = resolveLegacyAdminPageRedirect({
      currentPage: page,
      ids: routeIds,
      search,
    });

    if (legacyRedirect) {
      throw redirect({
        ...legacyRedirect,
        replace: true,
      });
    }
  },
  component: InstanceLayoutRoute,
  errorComponent: InstanceLayoutErrorComponent,
  loader: ({ context, params }) => {
    prefetchRouteData(
      context,
      instanceRouteDataQueries({
        instanceId: params.instanceId,
        transport: context.transport,
      })
    );
  },
  notFoundComponent: InstanceNotFoundComponent,
  search: {
    middlewares: [retainSearchParams([...PAGE_SEARCH_KEYS])],
  },
  validateSearch: instanceLayoutSearchSchema,
});
