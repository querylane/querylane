import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AdminHeader } from "@/components/admin-header";
import { AppSidebar } from "@/components/app-sidebar";
import { DatabaseLayout } from "@/components/database-layout";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/querylane-ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSetupStore } from "@/stores/setup-store";
import { ThemeProvider } from "@/theme-provider";

const navigateMock = vi.fn();
const adminHeaderMockState = vi.hoisted(() => ({
  instanceMode: {
    isConfigManaged: true,
    isLoaded: true,
  },
  instances: undefined as unknown,
  selectedInstance: undefined as unknown,
}));

function MockRouterLink({
  children,
  className,
  params: _params,
  ref,
  search: _search,
  to,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  params?: unknown;
  ref?: Ref<HTMLAnchorElement>;
  search?: unknown;
  to?: string;
}) {
  return (
    <a
      {...props}
      className={[
        "flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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

vi.mock("@tanstack/react-router", () => ({
  ...Object.fromEntries([
    ["CatchBoundary", MockCatchBoundary],
    ["Link", MockRouterLink],
  ]),
  useLocation: ({
    select,
  }: {
    select?: (location: unknown) => unknown;
  } = {}) => {
    const location = {
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

vi.mock("@/lib/db-context", () => ({
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
    navigateToDatabase: vi.fn(),
    navigateToInstance: vi.fn(),
    navigationIds: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
    queryStates: {
      databases: queryState,
      instances: queryState,
    },
    retryInstanceCatalog: vi.fn(async () => undefined),
    scopeLevel: "database",
    selectedDatabase,
    selectedInstance: adminHeaderMockState.selectedInstance,
    viewLevel: "database",
    viewOverview: vi.fn(),
  }),
}));

vi.mock("@/hooks/api/console", () => ({
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

vi.mock("@/hooks/api/github", () => ({
  useGithubRepoStarsQuery: () => ({ data: "1.2k" }),
}));

function applyFixtureManagedScreenshotScale() {
  const frameElement = window.frameElement;
  if (frameElement?.tagName !== "IFRAME") {
    return;
  }

  const iframe = frameElement as HTMLIFrameElement;
  iframe.style.transform = "none";
  iframe.style.transformOrigin = "left top";
}

beforeEach(() => {
  applyFixtureManagedScreenshotScale();
  navigateMock.mockClear();
  adminHeaderMockState.instanceMode = {
    isConfigManaged: true,
    isLoaded: true,
  };
  adminHeaderMockState.instances = undefined;
  adminHeaderMockState.selectedInstance = selectedInstance;
  useSetupStore.setState({ showDegradedBanner: false });
});

function renderAdminShell() {
  render(
    <ThemeProvider
      defaultTheme="dark"
      storageKey="querylane-admin-shell-browser-test-theme"
    >
      <TooltipProvider>
        <div
          className="dark h-[760px] w-[1100px] origin-top-left scale-[0.8] overflow-hidden rounded-2xl border border-border bg-background text-foreground"
          data-testid="admin-shell-visual-root"
        >
          <div className="h-full [--sidebar-width-icon:3rem] [--sidebar-width:16rem]">
            <SidebarProvider className="h-full max-h-full flex-col">
              <AdminHeader />
              <div className="flex min-h-0 flex-1">
                <AppSidebar />
                <SidebarInset className="min-w-0">
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
              </div>
            </SidebarProvider>
          </div>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function renderAdminShellAtViewport({ width }: { width: 320 | 768 }) {
  const widthClassName = width === 320 ? "w-[320px]" : "w-[768px]";
  render(
    <ThemeProvider
      defaultTheme="dark"
      storageKey={`querylane-admin-shell-browser-test-theme-${width}`}
    >
      <TooltipProvider>
        <div
          className={`dark h-[760px] ${widthClassName} origin-top-left overflow-hidden rounded-2xl border border-border bg-background text-foreground`}
          data-testid={`admin-shell-visual-root-${width}`}
        >
          <div className="h-full [--sidebar-width-icon:3rem] [--sidebar-width:16rem]">
            <SidebarProvider className="h-full max-h-full flex-col">
              <AdminHeader />
              <div className="flex min-h-0 flex-1">
                <AppSidebar />
                <SidebarInset className="min-w-0">
                  <main className="p-4 sm:p-6">
                    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
                      <h1 className="font-semibold text-2xl">
                        Database overview
                      </h1>
                      <p className="mt-2 text-muted-foreground text-sm">
                        Main content remains visible while compact navigation
                        protects smaller viewports from overflow.
                      </p>
                    </div>
                  </main>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </div>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function renderDatabaseLayoutWithDegradedBanner() {
  useSetupStore.setState({ showDegradedBanner: true });

  render(
    <ThemeProvider
      defaultTheme="dark"
      storageKey="querylane-admin-shell-browser-test-theme-degraded"
    >
      <TooltipProvider>
        <div
          className="dark h-[760px] w-[1100px] origin-top-left scale-[0.8] overflow-hidden rounded-2xl border border-border bg-background text-foreground"
          data-testid="admin-shell-visual-root"
        >
          <div className="h-full [--sidebar-width-icon:3rem] [--sidebar-width:16rem]">
            <DatabaseLayout page="database.overview">
              <div className="rounded-xl border border-border bg-card p-6">
                <h1 className="font-semibold text-2xl">Database overview</h1>
              </div>
            </DatabaseLayout>
          </div>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

test("degraded mode banner starts after the desktop sidebar", async () => {
  await page.viewport(1280, 800);
  renderDatabaseLayoutWithDegradedBanner();

  const bannerText = "Meta-database unreachable. Running in degraded mode.";
  await expect.element(page.getByText(bannerText)).toBeVisible();
  await expect.element(page.getByText("Collapse menu")).toBeVisible();

  const banner = document.querySelector("output");
  const sidebar = document.querySelector('[data-slot="sidebar-container"]');

  if (!(banner instanceof HTMLOutputElement)) {
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

test("admin shell shows selected instance, database, scoped navigation, and actions", async () => {
  renderAdminShell();

  await expect.element(page.getByText("Instance").first()).toBeVisible();
  await expect
    .element(
      page.getByText("Production Analytics Writer With Long Display Name")
    )
    .toBeVisible();
  await expect
    .element(page.getByText("customer_events_with_long_identifier"))
    .toBeVisible();
  await expect.element(page.getByText("Database overview")).toBeVisible();
  await expect.element(page.getByText("Collapse menu")).toBeVisible();

  const header = document.querySelector("header");
  const verticalSeparators = document.querySelectorAll(
    '[data-slot="separator"][data-orientation="vertical"]'
  );
  expect(header).not.toBeNull();
  expect(verticalSeparators.length).toBeGreaterThan(0);
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  for (const separator of verticalSeparators) {
    expect(separator.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      headerHeight - 1
    );
  }

  await expect(page.getByTestId("admin-shell-visual-root")).toMatchScreenshot(
    "admin-shell-database-scope"
  );
});

test("sidebar footer omits global settings", async () => {
  renderAdminShell();

  await expect.element(page.getByText("Collapse menu")).toBeVisible();
  expect(document.querySelector('[aria-label="Settings"]')).toBeNull();
  await expect
    .element(page.getByRole("button", { name: "Settings" }))
    .not.toBeInTheDocument();
  await expect.element(page.getByText("Data refresh")).not.toBeInTheDocument();
});

test("admin header instance selector uses a rich empty state with a create action", async () => {
  adminHeaderMockState.instanceMode = {
    isConfigManaged: false,
    isLoaded: true,
  };
  adminHeaderMockState.instances = [];
  adminHeaderMockState.selectedInstance = null;
  renderAdminShell();

  await page.getByText("Instance").first().click();

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

test("admin header keeps the disabled register instance tooltip open while hovered", async () => {
  renderAdminShell();

  await page.getByText("Instance").first().click();
  const registerInstanceText = page.getByText("Register instance");
  const registerInstanceItem = registerInstanceText
    .element()
    .closest('[data-slot="command-item"]');
  const tooltipTrigger = registerInstanceText
    .element()
    .closest("[data-base-ui-tooltip-trigger]");
  if (!(registerInstanceItem instanceof HTMLElement)) {
    throw new Error("Expected disabled register instance command item");
  }
  if (!(tooltipTrigger instanceof HTMLElement)) {
    throw new Error("Expected register instance tooltip trigger");
  }

  expect(registerInstanceItem.getAttribute("aria-disabled")).toBe("true");
  expect(registerInstanceItem.getAttribute("aria-selected")).toBe("false");

  await page.elementLocator(tooltipTrigger).hover();

  const tooltip = page.getByText(
    "Instances are managed via the server configuration file. Add them to your config and restart the server."
  );
  await expect.element(tooltip).toBeVisible();

  await new Promise((resolve) => setTimeout(resolve, 350));

  await expect.element(tooltip).toBeVisible();
});

test("admin shell phone viewport keeps compact header and drawer trigger stable", async () => {
  await page.viewport(320, 900);
  renderAdminShellAtViewport({ width: 320 });

  await expect
    .element(page.getByRole("button", { name: "Open navigation menu" }))
    .toBeVisible();
  await expect
    .element(page.getByText("customer_events_with_long_identifier"))
    .toBeVisible();
  await expect
    .element(page.getByTestId("admin-shell-visual-root-320"))
    .toMatchScreenshot("admin-shell-phone-compact");
});

test("admin shell tablet viewport keeps compact header without desktop sidebar", async () => {
  await page.viewport(768, 900);
  renderAdminShellAtViewport({ width: 768 });

  await expect
    .element(page.getByRole("button", { name: "Open navigation menu" }))
    .toBeVisible();
  await expect
    .element(page.getByText("customer_events_with_long_identifier"))
    .toBeVisible();
  await expect.element(page.getByText("Collapse menu")).not.toBeInTheDocument();
  await expect
    .element(page.getByTestId("admin-shell-visual-root-768"))
    .toMatchScreenshot("admin-shell-tablet-compact");
});
