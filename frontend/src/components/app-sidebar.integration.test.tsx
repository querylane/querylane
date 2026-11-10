import { expect, test } from "@rstest/core";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import {
  buildNavLinkProps,
  buildNavLinkSearch,
} from "@/components/sidebar-navigation";
import { routeTree } from "@/routeTree.gen";
import {
  CONSOLE_DATABASE_ID,
  CONSOLE_INSTANCE_ID,
  consoleResourceFixture,
  routeConsoleResources,
} from "@/test/fixtures/console-resource-fixtures";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";

// The browser suite tests shell events against controllable chunk imports.
// This test independently checks their destinations against the app's route tree.
test.each([
  { key: "database.sql", suffix: "sql" },
  { key: "database.workbench", suffix: "workbench" },
] as const)(
  "$key sidebar destination resolves without a legacy redirect",
  async ({ key, suffix }) => {
    const queryClient = createTestQueryClient();
    const fixture = consoleResourceFixture();
    const transport = createTestRouterTransport((rpcRouter) => {
      routeConsoleResources(rpcRouter, fixture);
    });
    const router = createRouter({
      context: { queryClient, transport },
      history: createMemoryHistory(),
      routeTree,
    });
    const link = buildNavLinkProps({
      currentPage: "database.overview",
      ids: { databaseId: CONSOLE_DATABASE_ID, instanceId: CONSOLE_INSTANCE_ID },
    })[key];
    if (
      !link ||
      (link.to !== "/instances/$instanceId/databases/$databaseId/sql" &&
        link.to !== "/instances/$instanceId/databases/$databaseId/workbench")
    ) {
      throw new Error("Expected a native workbench destination");
    }

    try {
      await router.navigate({
        params: link.params,
        search: (previous) => buildNavLinkSearch(link, previous),
        to: link.to,
      });
      expect(router.state.location.pathname).toBe(
        `/instances/${CONSOLE_INSTANCE_ID}/databases/${CONSOLE_DATABASE_ID}/${suffix}`
      );
      expect(router.state.location.search.page).toBeUndefined();
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: `/instances/$instanceId/databases/$databaseId/${suffix}`,
        status: "success",
      });
    } finally {
      await queryClient.cancelQueries();
      queryClient.clear();
    }
  }
);
