import { TransportProvider } from "@connectrpc/connect-query";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { afterEach, expect, rs, test } from "@rstest/core";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/querylane-ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { assertNever } from "@/lib/assert-never";
import { getDefaultPreload } from "@/lib/router-options";
import { ConsoleService } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";
import { ThemeProvider } from "@/theme-provider";

const DATABASE_PATH = "/instances/local/databases/app";
const WORKBENCH_PATH = "/instances/$instanceId/databases/$databaseId/workbench";
const SQL_PATH = "/instances/$instanceId/databases/$databaseId/sql";

// Selection and palette control are shell inputs, not part of route readiness.
rs.mock("@/lib/db-context-state", () => ({
  useDb: () => ({
    databases: [],
    navigationIds: { databaseId: "app", instanceId: "local" },
    queryStates: { databases: { error: null, isPending: false } },
    scopeLevel: "database",
    selectedDatabase: null,
    selectedInstance: null,
    viewLevel: "database",
  }),
}));

rs.mock("@/components/querylane-ui/command-palette-context", () => ({
  useCommandPalette: () => ({ openPalette: rs.fn() }),
}));

function SidebarIntentShell() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="sidebar-intent-test-theme">
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <main>
            <Outlet />
          </main>
        </SidebarProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function Destination() {
  return <h1>Destination ready</h1>;
}

async function renderSidebarIntent() {
  const queryClient = createTestQueryClient();
  const transport = createTestRouterTransport((rpcRouter) => {
    rpcRouter.service(ConsoleService, { getConsoleConfig: () => ({}) });
  });
  const unary = rs.spyOn(transport, "unary");
  const parentLoader = rs.fn();
  const beforeLoad = rs.fn();
  const loader = rs.fn();
  const workbenchModule = Promise.withResolvers<{
    default: typeof Destination;
  }>();
  const sqlModule = Promise.withResolvers<{ default: typeof Destination }>();
  const workbenchImport = rs.fn(() => workbenchModule.promise);
  const sqlImport = rs.fn(() => sqlModule.promise);
  const root = createRootRoute({
    component: SidebarIntentShell,
    loader: parentLoader,
  });
  const overview = createRoute({
    component: Destination,
    getParentRoute: () => root,
    path: "/instances/$instanceId/databases/$databaseId/",
  });
  const workbench = createRoute({
    beforeLoad,
    component: lazyRouteComponent(workbenchImport),
    getParentRoute: () => root,
    loader,
    path: WORKBENCH_PATH,
  });
  const sql = createRoute({
    beforeLoad,
    component: lazyRouteComponent(sqlImport),
    getParentRoute: () => root,
    loader,
    path: SQL_PATH,
  });
  const router = createRouter({
    defaultPreload: getDefaultPreload(),
    history: createMemoryHistory({ initialEntries: [DATABASE_PATH] }),
    routeTree: root.addChildren([overview, workbench, sql]),
  });
  const preloadRoute = rs.spyOn(router, "preloadRoute");
  await render(
    <QueryClientProvider client={queryClient}>
      <TransportProvider transport={transport}>
        <RouterProvider router={router} />
      </TransportProvider>
    </QueryClientProvider>
  );
  await expect
    .element(page.getByRole("link", { name: "SQL workbench", exact: true }))
    .toBeVisible();
  await expect.poll(() => unary.mock.calls.length).toBe(1);
  await expect.poll(() => queryClient.isFetching()).toBe(0);
  unary.mockClear();
  parentLoader.mockClear();
  return {
    beforeLoad,
    loader,
    parentLoader,
    preloadRoute,
    queryClient,
    router,
    sqlImport,
    sqlModule,
    unary,
    workbenchImport,
    workbenchModule,
  };
}

const ORIGINAL_ONLINE = Object.getOwnPropertyDescriptor(navigator, "onLine");
const ORIGINAL_CONNECTION = Object.getOwnPropertyDescriptor(
  navigator,
  "connection"
);

function restoreNavigatorProperty(
  name: "connection" | "onLine",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(navigator, name, descriptor);
  } else {
    Reflect.deleteProperty(navigator, name);
  }
}

afterEach(() => {
  restoreNavigatorProperty("onLine", ORIGINAL_ONLINE);
  restoreNavigatorProperty("connection", ORIGINAL_CONNECTION);
});

const INTENT_CASES = [
  { label: "SQL workbench", path: "workbench" },
  { label: "SQL", path: "sql" },
].flatMap((destination) =>
  (["hover", "focus", "touch"] as const).map((interaction) => ({
    ...destination,
    interaction,
  }))
);

test.each(INTENT_CASES)(
  "$label $interaction loads code once, never data, and navigation remains reachable",
  async ({ interaction, label, path }) => {
    const state = await renderSidebarIntent();
    const link = page.getByRole("link", { exact: true, name: label });
    const importCode =
      path === "workbench" ? state.workbenchImport : state.sqlImport;
    const otherImport =
      path === "workbench" ? state.sqlImport : state.workbenchImport;
    const module =
      path === "workbench" ? state.workbenchModule : state.sqlModule;

    try {
      expect(importCode).not.toHaveBeenCalled();
      switch (interaction) {
        case "hover":
          await link.hover();
          break;
        case "focus":
          await link.focus();
          break;
        case "touch":
          await link.dispatchEvent("touchstart");
          break;
        default:
          assertNever(interaction);
      }
      await expect.poll(() => importCode.mock.calls.length).toBe(1);
      await link.focus();
      await link.dispatchEvent("touchstart");
      await link.hover();
      expect(importCode).toHaveBeenCalledTimes(1);
      expect(otherImport).not.toHaveBeenCalled();
      expect(state.beforeLoad).not.toHaveBeenCalled();
      expect(state.loader).not.toHaveBeenCalled();
      expect(state.parentLoader).not.toHaveBeenCalled();
      expect(state.preloadRoute).not.toHaveBeenCalled();
      expect(state.unary).not.toHaveBeenCalled();
      expect(state.queryClient.getQueryCache().getAll()).toHaveLength(1);

      module.resolve({ default: Destination });
      await link.click();
      await expect
        .poll(() => state.router.state.location.pathname)
        .toBe(`${DATABASE_PATH}/${path}`);
      await expect
        .poll(() => state.router.state.matches.at(-1))
        .toMatchObject({
          routeId: path === "workbench" ? WORKBENCH_PATH : SQL_PATH,
          status: "success",
        });
      expect(state.beforeLoad).toHaveBeenCalledTimes(1);
      expect(state.loader).toHaveBeenCalledTimes(1);
      expect(importCode).toHaveBeenCalledTimes(1);
    } finally {
      module.resolve({ default: Destination });
      // Do not leave the physical pointer over a fresh sidebar in the next test.
      await page.getByRole("heading", { name: "Destination ready" }).hover();
      state.queryClient.clear();
    }
  }
);

test.each([
  { label: "offline", online: false, connection: {} },
  { label: "save data", online: true, connection: { saveData: true } },
  { label: "slow-2g", online: true, connection: { effectiveType: "slow-2g" } },
  { label: "2g", online: true, connection: { effectiveType: "2g" } },
  { label: "3g", online: true, connection: { effectiveType: "3g" } },
])(
  "$label blocks speculative work and the next healthy intent rechecks the connection",
  async ({ online, connection }) => {
    const state = await renderSidebarIntent();
    const link = page.getByRole("link", { exact: true, name: "SQL workbench" });
    Object.defineProperties(navigator, {
      connection: { configurable: true, value: connection },
      onLine: { configurable: true, value: online },
    });

    try {
      await link.hover();
      await link.focus();
      await link.dispatchEvent("touchstart");
      expect(state.workbenchImport).not.toHaveBeenCalled();
      expect(state.beforeLoad).not.toHaveBeenCalled();
      expect(state.loader).not.toHaveBeenCalled();
      expect(state.parentLoader).not.toHaveBeenCalled();
      expect(state.preloadRoute).not.toHaveBeenCalled();
      expect(state.unary).not.toHaveBeenCalled();
      expect(state.queryClient.getQueryCache().getAll()).toHaveLength(1);

      Object.defineProperties(navigator, {
        connection: { configurable: true, value: { effectiveType: "4g" } },
        onLine: { configurable: true, value: true },
      });
      await link.dispatchEvent("touchstart");
      await expect.poll(() => state.workbenchImport.mock.calls.length).toBe(1);
      expect(state.unary).not.toHaveBeenCalled();
      expect(state.loader).not.toHaveBeenCalled();
    } finally {
      state.workbenchModule.resolve({ default: Destination });
      await page.getByRole("heading", { name: "Destination ready" }).hover();
      state.queryClient.clear();
    }
  }
);
