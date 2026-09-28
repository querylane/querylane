import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { beforeEach, expect, rs, test } from "@rstest/core";
import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { AdminHeader } from "@/components/admin-header";
import { AppSidebar } from "@/components/app-sidebar";
import { DatabaseLayout } from "@/components/database-layout";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { CommandPaletteProvider } from "@/components/querylane-ui/admin-command-palette";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/querylane-ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSetupStore } from "@/stores/setup-store";
import { ThemeProvider } from "@/theme-provider";

const INSTANCE_SELECTOR_NAME = /^Instance:/;
const navigateMock = rs.fn(async () => undefined);
const adminHeaderMockState = rs.hoisted(() => ({
  instanceMode: {
    isConfigManaged: true,
    isLoaded: true,
  },
  instances: undefined as unknown,
  isInstanceRolesRoute: false,
  selectedInstance: undefined as unknown,
}));

function MockRouterLink({
  children,
  className,
  params: _params,
  preload: _preload,
  ref,
  search: _search,
  to,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  params?: unknown;
  preload?: false | "intent" | "render" | "viewport";
  ref?: Ref<HTMLAnchorElement>;
  search?: unknown;
  to?: string;
}) {
  return (
    <a
      {...props}
      className={cn(
        "flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm",
        className
      )}
      href={props.href ?? to ?? "/"}
      ref={ref}
    >
      {children}
    </a>
  );
}

function MockCatchBoundary({ children }: { children: ReactNode }) {
  return children;
}

rs.mock("@tanstack/react-router", () => ({
  ...Object.fromEntries([
    ["CatchBoundary", MockCatchBoundary],
    ["Link", MockRouterLink],
  ]),
  useLocation: ({
    select,
  }: {
    select?: (location: unknown) => unknown;
  } = {}) => {
    const location = adminHeaderMockState.isInstanceRolesRoute
      ? {
          href: "/instances/prod-analytics/roles",
          pathname: "/instances/prod-analytics/roles",
          search: {},
        }
      : {
          href: "/instances/prod-analytics/databases/customer-events?page=database.overview",
          pathname: "/instances/prod-analytics/databases/customer-events",
          search: { page: "database.overview" },
        };
    return select ? select(location) : location;
  },
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: async () => undefined }),
  useRouterState: ({
    select,
  }: {
    select?: (state: { isLoading: boolean }) => unknown;
  } = {}) => {
    const state = { isLoading: false };
    return select ? select(state) : state;
  },
}));

const queryState = {
  error: null,
  hasData: true,
  hasResolved: true,
  isFetching: false,
  isPending: false,
  isSuppressed: false,
  status: "success",
  suppressedReason: null,
} as const;

const selectedInstance = {
  connectionError: "",
  credentialsUnreadable: false,
  host: "analytics-writer.internal.querylane.test",
  id: "prod-analytics",
  name: "Production Analytics Writer With Long Display Name",
  port: 5432,
  resourceName: "instances/prod-analytics",
  status: "connected",
} as const;

const selectedDatabase = {
  characterSet: "UTF8",
  collation: "en_US.UTF-8",
  id: "customer-events",
  isSystemDatabase: false,
  name: "customer_events_with_long_identifier",
  owner: "data-platform",
  resourceName: "instances/prod-analytics/databases/customer-events",
} as const;

rs.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: [
      selectedDatabase,
      {
        ...selectedDatabase,
        id: "warehouse",
        name: "warehouse",
        resourceName: "instances/prod-analytics/databases/warehouse",
      },
    ],
    instances: adminHeaderMockState.instances ?? [
      selectedInstance,
      {
        ...selectedInstance,
        connectionError: "connection refused",
        host: "archive.internal.querylane.test",
        id: "archive",
        name: "Archive Instance",
        resourceName: "instances/archive",
        status: "error",
      },
    ],
    navigateToDatabase: rs.fn(),
    navigateToInstance: rs.fn(),
    navigationIds: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
    queryStates: {
      databases: queryState,
      instances: queryState,
    },
    retryInstanceCatalog: rs.fn(async () => undefined),
    scopeLevel: "database",
    selectedDatabase: adminHeaderMockState.isInstanceRolesRoute
      ? null
      : selectedDatabase,
    selectedInstance: adminHeaderMockState.selectedInstance,
    viewLevel: "database",
    viewOverview: rs.fn(),
  }),
}));

rs.mock("@/hooks/api/console", () => ({
  CONSOLE_CONFIG_STATIC_QUERY_OPTIONS: {},
  useConfigManagedInstancesStatus: () => adminHeaderMockState.instanceMode,
  useGetConsoleConfigQuery: () => ({
    data: {
      buildInfo: {
        buildTime: "2026-05-20T10:00:00Z",
        gitBranch: "main",
        gitCommit: "abcdef1234567890",
        version: "0.0.0-test",
      },
    },
    error: null,
  }),
  useIsConfigManagedInstances: () =>
    adminHeaderMockState.instanceMode.isConfigManaged,
}));

rs.mock("@/hooks/api/github", () => ({
  useGithubRepoStarsQuery: () => ({ data: "1.2k" }),
}));

rs.mock("@/hooks/api/database-catalog", () => {
  const catalogQuery = {
    data: {
      objects: [
        {
          kind: "table",
          objectId: "shipments",
          rowCount: 2_400_000n,
          schemaId: "public",
        },
        {
          kind: "table",
          objectId: "shipment_event",
          rowCount: 18_200_000n,
          schemaId: "public",
        },
        {
          kind: "table",
          objectId: "carriers",
          rowCount: 312n,
          schemaId: "public",
        },
        {
          kind: "table",
          objectId: "containers",
          rowCount: 88_000n,
          schemaId: "public",
        },
        {
          kind: "view",
          objectId: "active_shipments",
          rowCount: 0n,
          schemaId: "public",
        },
      ],
    },
    error: null,
    isPending: false,
  };

  return {
    useDatabaseCatalogQuery: () => catalogQuery,
    useDatabaseCatalogSearchQuery: () => catalogQuery,
  };
});

rs.mock("@/hooks/api/role", () => ({
  rolesForInstanceQueryInput: (instanceId: string) => ({ instanceId }),
  useListRolesQuery: () => ({
    data: { roles: [] },
    error: null,
    isPending: false,
  }),
  useListAllRolesQuery: () => ({
    data: {
      roles: [
        {
          attributes: { canLogin: true },
          isSystemRole: false,
          name: "instances/prod-analytics/roles/app-reader",
          roleName: "app_reader",
        },
      ],
    },
    error: null,
    isPending: false,
  }),
}));

beforeEach(() => {
  navigateMock.mockClear();
  adminHeaderMockState.instanceMode = {
    isConfigManaged: true,
    isLoaded: true,
  };
  adminHeaderMockState.instances = undefined;
  adminHeaderMockState.isInstanceRolesRoute = false;
  adminHeaderMockState.selectedInstance = selectedInstance;
  useSetupStore.setState({ showDegradedBanner: false });
});

function leafElementWithText(root: ParentNode, text: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).find(
    (element) => element.textContent === text && element.childElementCount === 0
  );
}

// Pixels for the shell, its overlays, and the phone and tablet layouts live in
// e2e/visual/admin-shell.spec.ts, which drives the real app shell. Viewport
// sizes are config-only here (1280x1000), so compact-layout behavior moved too.
function renderAdminShell() {
  return render(
    <ThemeProvider
      defaultTheme="dark"
      storageKey="querylane-admin-shell-browser-test-theme"
    >
      <TooltipProvider>
        <div
          className="dark h-[760px] w-[1100px] overflow-hidden rounded-2xl border border-border bg-background text-foreground"
          data-testid="admin-shell-visual-root"
        >
          <div className="h-full [--sidebar-width-icon:3rem] [--sidebar-width:16rem]">
            <KeyboardShortcutsProvider>
              <CommandPaletteProvider>
                <SidebarProvider className="h-full max-h-full">
                  <AppSidebar />
                  <SidebarInset className="min-w-0">
                    <AdminHeader />
                    <main className="p-6">
                      <div className="rounded-xl border border-border bg-card p-6">
                        <h1 className="font-semibold text-2xl">
                          Database overview
                        </h1>
                        <p className="mt-2 text-muted-foreground text-sm">
                          Main content remains visible while the header and
                          sidebar expose the active instance/database path.
                        </p>
                      </div>
                    </main>
                  </SidebarInset>
                </SidebarProvider>
              </CommandPaletteProvider>
            </KeyboardShortcutsProvider>
          </div>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function renderDatabaseLayout({
  page: layoutPage,
  showDegradedBanner = false,
  title,
}: {
  page: "database.explorer" | "database.overview";
  showDegradedBanner?: boolean;
  title: string;
}) {
  const visualTheme =
    document.documentElement.dataset["visualTheme"] === "dark"
      ? "dark"
      : "light";
  useSetupStore.setState({ onboardingState: null, showDegradedBanner });

  return render(
    <ThemeProvider
      defaultTheme={visualTheme}
      storageKey="querylane-admin-shell-browser-test-theme-layout"
    >
      <TooltipProvider>
        <div
          className={cn(
            visualTheme,
            "h-[760px] w-[1100px] overflow-hidden rounded-lg border border-border bg-background text-foreground"
          )}
          data-testid="admin-shell-visual-root"
        >
          <div className="h-full [--sidebar-width-icon:3rem] [--sidebar-width:16rem]">
            <DatabaseLayout page={layoutPage}>
              <div className="rounded-xl border border-border bg-card p-6">
                <h1 className="font-semibold text-2xl">{title}</h1>
              </div>
            </DatabaseLayout>
          </div>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

test("explorer route swaps the workspace nav for a drill-in rail", async () => {
  await renderDatabaseLayout({
    page: "database.explorer",
    title: "Explorer detail",
  });

  const backLink = page.getByRole("link", { name: "Back to workspace" });
  await expect.element(backLink).toBeVisible();

  // The workspace nav is replaced in place — same rail, no nav links.
  await expect
    .element(page.getByRole("link", { name: "Database Data Explorer" }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("link", { name: "Instance Overview" }))
    .not.toBeAttached();

  // Back leads to the database overview (mock Link keeps the route template).
  await expect
    .element(backLink)
    .toHaveAttribute("href", "/instances/$instanceId/databases/$databaseId");

  // The rail footer stays available in explorer mode.
  await expect
    .element(page.getByRole("button", { name: "Collapse sidebar" }))
    .toBeVisible();
});

test("degraded mode banner starts after the desktop sidebar", async () => {
  await renderDatabaseLayout({
    page: "database.overview",
    showDegradedBanner: true,
    title: "Database overview",
  });

  const bannerText =
    "Meta database unavailable. Querylane is running in degraded mode.";
  const reconfigureButton = page.getByRole("button", {
    name: "Reconfigure internal storage",
  });
  await expect.element(page.getByText(bannerText)).toBeVisible();
  await expect.element(reconfigureButton).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Collapse sidebar" }))
    .toBeVisible();
  await expect
    .element(reconfigureButton)
    .not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const banner = Array.from(document.querySelectorAll("output")).find((item) =>
    item.textContent.includes("Meta database unavailable")
  )?.parentElement;
  const sidebar = document.querySelector('[data-slot="sidebar-container"]');

  if (!(banner instanceof HTMLDivElement)) {
    throw new Error("Expected degraded banner element to be mounted");
  }
  if (!(sidebar instanceof HTMLDivElement)) {
    throw new Error("Expected desktop sidebar container to be mounted");
  }

  const bannerRect = banner.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();

  expect(sidebarRect.right).toBeGreaterThan(0);
  expect(bannerRect.left).toBeGreaterThanOrEqual(sidebarRect.right - 1);
});

test("internal storage recovery dialog presents the reset steps", async () => {
  await renderDatabaseLayout({
    page: "database.overview",
    showDegradedBanner: true,
    title: "Database overview",
  });

  await page
    .getByRole("button", { name: "Reconfigure internal storage" })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Reconfigure internal storage",
  });
  await expect.element(dialog).toBeVisible();
  await expect
    .element(page.getByText("querylane server reset-config", { exact: false }))
    .toBeVisible();
});

test("admin shell shows selected instance, database, scoped navigation, and actions", async () => {
  await renderAdminShell();

  await expect
    .element(page.getByRole("button", { name: INSTANCE_SELECTOR_NAME }))
    .toBeVisible();
  await expect
    .element(
      page.getByText("Production Analytics Writer With Long Display Name")
    )
    .toBeVisible();
  await expect
    .element(page.getByText("customer_events_with_long_identifier").first())
    .toBeVisible();
  await expect.element(page.getByText("Database overview")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Collapse sidebar" }))
    .toBeVisible();
  await expect.element(page.locator("header")).toBeAttached();
});

test("admin header truncates a long instance name without wrapping and exposes the full name", async () => {
  const longInstanceName =
    "katana-mcp (gear profiles + tone presets) with an extra long suffix";
  adminHeaderMockState.isInstanceRolesRoute = true;
  adminHeaderMockState.selectedInstance = {
    ...selectedInstance,
    name: longInstanceName,
  };
  await renderAdminShell();

  const instanceSelector = page.getByRole("button", {
    name: `Instance: ${longInstanceName}`,
  });
  const instanceName = instanceSelector.getByText(longInstanceName);
  const rolesBreadcrumb = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByText("Roles");

  await expect.element(instanceSelector).toBeVisible();
  await expect.element(rolesBreadcrumb).toBeVisible();
  await expect.element(instanceName).toHaveCSS("white-space", "nowrap");

  const instanceNameElement = leafElementWithText(document, longInstanceName);
  const breadcrumb = document.querySelector('nav[aria-label="Breadcrumb"]');
  const rolesElement = breadcrumb && leafElementWithText(breadcrumb, "Roles");
  if (!(instanceNameElement && rolesElement)) {
    throw new Error("Expected instance name and roles breadcrumb elements");
  }

  expect(instanceNameElement.scrollWidth).toBeGreaterThan(
    instanceNameElement.clientWidth
  );
  expect(instanceNameElement.getBoundingClientRect().right).toBeLessThanOrEqual(
    rolesElement.getBoundingClientRect().left
  );
  expect(
    instanceNameElement.closest('[data-slot="tooltip-trigger"]')
  ).toBeInstanceOf(HTMLElement);

  await instanceName.hover();
  await expect.element(page.getByText(longInstanceName)).toHaveCount(2);
  await expect
    .element(
      page.locator('[data-slot="tooltip-content"]').getByText(longInstanceName)
    )
    .toBeVisible();
});

test("command palette opens over the full admin layout", async () => {
  await renderAdminShell();

  await page.getByRole("button", { name: "Search or jump to" }).click();

  const dialog = page.getByRole("dialog", { name: "Search or jump to" });
  await expect.element(dialog).toBeVisible();
  await expect.element(page.getByText("Go to")).toBeVisible();
  await expect.element(page.getByText("Tables", { exact: true })).toBeVisible();
  await expect
    .element(
      page.getByText("customer_events_with_long_identifier.public.shipments")
    )
    .toBeVisible();
});

test("keyboard shortcut help opens over the full admin layout", async () => {
  await renderAdminShell();

  await page.locator("body").press("Shift+?");

  await expect
    .element(page.getByRole("dialog", { name: "Keyboard shortcuts" }))
    .toBeVisible();
  await expect.element(page.getByText("Show keyboard shortcuts")).toBeVisible();
  await expect.element(page.getByText("Move between cells")).toBeVisible();
});

test("sidebar footer omits global settings", async () => {
  await renderAdminShell();

  await expect
    .element(page.getByRole("button", { name: "Collapse sidebar" }))
    .toBeVisible();
  expect(document.querySelector('[aria-label="Settings"]')).toBeNull();
  await expect
    .element(page.getByRole("button", { name: "Settings" }))
    .not.toBeAttached();
  await expect.element(page.getByText("Data refresh")).not.toBeAttached();
});

test("admin header instance selector uses a rich empty state with a create action", async () => {
  adminHeaderMockState.instanceMode = {
    isConfigManaged: false,
    isLoaded: true,
  };
  adminHeaderMockState.instances = [];
  adminHeaderMockState.selectedInstance = null;
  await renderAdminShell();

  await page.getByRole("button", { name: "Select instance" }).click();

  await expect
    .element(page.getByRole("heading", { name: "No instances found" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Create an instance to connect Querylane."))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Create instance" }))
    .toBeVisible();
  expect(document.querySelector('[data-slot="empty"]')).not.toBeNull();
});

test("admin header routes unreadable credentials to credential recovery", async () => {
  adminHeaderMockState.instances = [
    {
      ...selectedInstance,
      credentialsUnreadable: true,
      status: "error",
    },
  ];
  adminHeaderMockState.selectedInstance = null;
  await renderAdminShell();

  await page.getByRole("button", { name: "Select instance" }).click();
  await expect
    .element(page.getByText("Credentials need attention"))
    .toBeVisible();
  await page.getByText("Review credentials").click();

  expect(navigateMock).toHaveBeenCalledWith({
    params: { instanceId: "prod-analytics" },
    to: "/instances/$instanceId/configuration",
  });
});

test("admin header keeps the disabled register instance tooltip open while hovered", async () => {
  await renderAdminShell();

  await page.getByRole("button", { name: INSTANCE_SELECTOR_NAME }).click();
  const registerInstanceItem = page
    .locator('[data-slot="command-item"]')
    .filter({ hasText: "Register instance" });
  await expect
    .element(registerInstanceItem)
    .toHaveAttribute("aria-disabled", "true");
  await expect
    .element(registerInstanceItem)
    .toHaveAttribute("aria-selected", "false");

  const tooltipTrigger = page
    .locator("[data-base-ui-tooltip-trigger]")
    .filter({ hasText: "Register instance" });
  await expect.element(tooltipTrigger).toBeAttached();
  await tooltipTrigger.hover();

  const tooltip = page.getByText(
    "Instances are managed via the server configuration file. Add them to your config and restart the server."
  );
  await expect.element(tooltip).toBeVisible();

  await new Promise((resolve) => setTimeout(resolve, 350));

  await expect.element(tooltip).toBeVisible();
});
