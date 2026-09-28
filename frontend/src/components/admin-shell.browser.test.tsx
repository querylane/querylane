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
import {
  ADMIN_SHELL_FIXTURE,
  CONSOLE_DATABASE_ID,
  CONSOLE_INSTANCE_ID,
  consoleResourceFixture,
  LONG_DATABASE_NAME,
  LONG_INSTANCE_NAME,
  routeConsoleResources,
} from "@/test/fixtures/console-resource-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import { ThemeProvider } from "@/theme-provider";
import { HarnessProviders } from "@/visual-harness/harness-providers";

const INSTANCE_SELECTOR_NAME = /^Instance:/;
const navigateMock = rs.fn(async () => undefined);
const adminHeaderMockState = rs.hoisted(() => ({
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
          href: `/instances/${CONSOLE_INSTANCE_ID}/roles`,
          pathname: `/instances/${CONSOLE_INSTANCE_ID}/roles`,
          search: {},
        }
      : {
          href: `/instances/${CONSOLE_INSTANCE_ID}/databases/${CONSOLE_DATABASE_ID}?page=database.overview`,
          pathname: `/instances/${CONSOLE_INSTANCE_ID}/databases/${CONSOLE_DATABASE_ID}`,
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
  id: CONSOLE_INSTANCE_ID,
  name: LONG_INSTANCE_NAME,
  port: 5432,
  resourceName: `instances/${CONSOLE_INSTANCE_ID}`,
  status: "connected",
} as const;

const selectedDatabase = {
  characterSet: "UTF8",
  collation: "en_US.UTF-8",
  id: CONSOLE_DATABASE_ID,
  isSystemDatabase: false,
  name: LONG_DATABASE_NAME,
  owner: "data-platform",
  resourceName: `instances/${CONSOLE_INSTANCE_ID}/databases/${CONSOLE_DATABASE_ID}`,
} as const;

rs.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: [
      selectedDatabase,
      {
        ...selectedDatabase,
        id: "warehouse",
        name: "warehouse",
        resourceName: `instances/${CONSOLE_INSTANCE_ID}/databases/warehouse`,
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
      databaseId: CONSOLE_DATABASE_ID,
      instanceId: CONSOLE_INSTANCE_ID,
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

// Stars come from the GitHub REST API, not a Connect RPC.
rs.mock("@/hooks/api/github", () => ({
  useGithubRepoStarsQuery: () => ({ data: "1.2k" }),
}));

beforeEach(() => {
  navigateMock.mockClear();
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

function renderWithConsole(ui: ReactNode, { configManaged = true } = {}) {
  const fixture = consoleResourceFixture({
    ...ADMIN_SHELL_FIXTURE,
    configManaged,
  });
  const transport = createTestRouterTransport((router) =>
    routeConsoleResources(router, fixture)
  );
  return render(
    <HarnessProviders transport={transport}>{ui}</HarnessProviders>
  );
}

// Pixels for the shell, its overlays, and the phone and tablet layouts live in
// e2e/visual/admin-shell.spec.ts, which drives the real app shell from the
// same fixture. Viewport sizes are config-only here (1280x1000), so
// compact-layout behavior moved too.
function renderAdminShell(options?: { configManaged?: boolean }) {
  return renderWithConsole(
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
    </ThemeProvider>,
    options
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

  return renderWithConsole(
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
  await expect.element(page.getByText(LONG_INSTANCE_NAME)).toBeVisible();
  await expect
    .element(page.getByText(LONG_DATABASE_NAME).first())
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
    .element(page.getByText(`${LONG_DATABASE_NAME}.public.shipments`))
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
  adminHeaderMockState.instances = [];
  adminHeaderMockState.selectedInstance = null;
  await renderAdminShell({ configManaged: false });

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
    params: { instanceId: CONSOLE_INSTANCE_ID },
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
