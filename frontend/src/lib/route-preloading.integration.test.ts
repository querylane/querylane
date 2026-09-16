import { describe, expect, rs, test } from "@rstest/core";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { preloadRouteCode } from "@/lib/route-code-preload";
import { getDefaultPreload } from "@/lib/router-options";
import { routeTree } from "@/routeTree.gen";
import { createTestRouterTransport } from "@/test/router-transport";

describe("native route preloading", () => {
  test.each([
    {
      name: "instance",
      routeId: "/instances/$instanceId/",
      to: "/instances/$instanceId",
    },
    {
      name: "database overview",
      routeId: "/instances/$instanceId/databases/$databaseId/",
      to: "/instances/$instanceId/databases/$databaseId",
    },
    {
      name: "extensions",
      routeId: "/instances/$instanceId/databases/$databaseId/extensions",
      to: "/instances/$instanceId/databases/$databaseId/extensions",
    },
    {
      name: "selected table",
      routeId: "/instances/$instanceId/databases/$databaseId/explorer",
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    },
  ] as const)(
    "$name: code-only preload, data on navigation",
    async ({ routeId, to }) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        },
      });
      const transport = createTestRouterTransport(() => undefined);
      const unary = rs.spyOn(transport, "unary");
      const router = createRouter({
        context: { queryClient, transport },
        defaultPreload: getDefaultPreload(),
        defaultPreloadStaleTime: 0,
        history: createMemoryHistory(),
        routeTree,
      });

      try {
        const target = {
          params: { databaseId: "postgres", instanceId: "local" },
          search: {
            category: "tables" as const,
            name: "users",
            schema: "public",
          },
          to,
        };
        await preloadRouteCode(router, router.routesById[routeId]);
        expect(unary).not.toHaveBeenCalled();
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

        await router.navigate(target);
        expect(unary).toHaveBeenCalled();

        // Active parent matches have different Router preload semantics.
        // Even with no Query cache, hovering a sibling must not refetch them.
        await queryClient.cancelQueries();
        queryClient.clear();
        unary.mockClear();
        await preloadRouteCode(
          router,
          router.routesById[
            "/instances/$instanceId/databases/$databaseId/extensions"
          ]
        );
        expect(unary).not.toHaveBeenCalled();
      } finally {
        queryClient.clear();
      }
    }
  );
});
