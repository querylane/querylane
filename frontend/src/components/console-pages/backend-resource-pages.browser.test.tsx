import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { beforeEach, expect, rs, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import type { ReactNode } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BackendDatabaseExtensionsPage } from "@/components/console-pages/database-extensions-page";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
import { BackendInstancePage } from "@/components/console-pages/instance-page";
import { cn } from "@/lib/utils";
import {
  busyActivity,
  CONSOLE_DATABASE_ID,
  CONSOLE_INSTANCE_ID,
  type ConsoleResourceFixture,
  catalogSchema,
  catalogTable,
  consoleCatalog,
  consoleResourceFixture,
  designExtensions,
  queryInsights,
  routeConsoleResources,
} from "@/test/fixtures/console-resource-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import { HarnessProviders } from "@/visual-harness/harness-providers";

const BLOCKED_ACTIVITY_ROW_NAME =
  /4302.*api-gateway.*UPDATE shipping\.shipments/;
const PG_STAT_STATEMENTS_BUTTON_NAME = /pg_stat_statements/i;
const REPLICATION_ROW_NAME = /Replication/;
const SHARED_PRELOAD_LIBRARIES_TEXT = /Loaded via shared_preload_libraries/;
const TIMESCALEDB_BUTTON_NAME = /timescaledb/i;
const DENSE_SCHEMA_COUNT = 12;

// Pixels for these pages, and every phone-width layout check, live in
// e2e/visual/console-resources.spec.ts on the real console routes, served
// from the same fixture.

const state = rs.hoisted(() => ({
  navigate: rs.fn(async () => undefined),
  selectedInstanceStatus: "connected" as "connected" | "disconnected",
}));

rs.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
  }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
  useLocation: ({
    select,
  }: {
    select?: (location: {
      hash: string;
      pathname: string;
      searchStr: string;
    }) => unknown;
  } = {}) => {
    const location = {
      hash: "",
      pathname: `/instances/${CONSOLE_INSTANCE_ID}`,
      searchStr: "",
    };
    return select ? select(location) : location;
  },
  useNavigate: () => state.navigate,
  useSearch: ({
    select,
  }: {
    select?: (search: Record<string, unknown>) => unknown;
  } = {}) => (select ? select({}) : {}),
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

rs.mock("@/lib/db-context", () => {
  const instance = (id: string, name: string) => ({
    connectionError: "",
    host: "analytics-writer.internal.querylane.test",
    id,
    name,
    port: 5432,
    resourceName: `instances/${id}`,
    status: "connected",
  });
  return {
    useDb: () => ({
      databases: [
        {
          characterSet: "UTF8",
          collation: "en_US.UTF-8",
          id: CONSOLE_DATABASE_ID,
          isSystemDatabase: false,
          name: "customer_events",
          owner: "data-platform",
          resourceName: `instances/${CONSOLE_INSTANCE_ID}/databases/${CONSOLE_DATABASE_ID}`,
        },
        {
          characterSet: "UTF8",
          collation: "C",
          id: "postgres",
          isSystemDatabase: true,
          name: "postgres",
          owner: "postgres",
          resourceName: `instances/${CONSOLE_INSTANCE_ID}/databases/postgres`,
        },
      ],
      instances: [
        instance(CONSOLE_INSTANCE_ID, "Production Analytics Writer"),
        instance("archive", "Archive Instance"),
      ],
      navigateToDatabase: rs.fn(),
      queryStates: { databases: queryState, instances: queryState },
      retryInstanceCatalog: rs.fn(async () => undefined),
      selectedInstance: {
        ...instance(CONSOLE_INSTANCE_ID, "Production Analytics Writer"),
        status: state.selectedInstanceStatus,
      },
    }),
  };
});

beforeEach(() => {
  window.localStorage.removeItem("querylane-browser-test-theme");
  const visualTheme =
    document.documentElement.dataset["visualTheme"] === "dark"
      ? "dark"
      : "light";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(visualTheme);
  document.documentElement.style.colorScheme = visualTheme;
  state.selectedInstanceStatus = "connected";
  state.navigate.mockClear();
});

async function renderConsolePage(
  ui: ReactNode,
  overrides: Partial<ConsoleResourceFixture> = {},
  width = "w-[1120px] p-6"
) {
  const fixture = consoleResourceFixture(overrides);
  const transport = createTestRouterTransport((router) =>
    routeConsoleResources(router, fixture)
  );
  await render(
    <HarnessProviders transport={transport}>
      <ScreenshotFrame>
        <div
          className={cn(
            width,
            "rounded-2xl border border-border bg-background text-foreground"
          )}
          data-testid="console-page"
        >
          {ui}
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );
  return fixture;
}

function InstancePage({
  section,
}: {
  section: "activity" | "configuration" | "overview";
}) {
  return (
    <BackendInstancePage
      instanceId={CONSOLE_INSTANCE_ID}
      searchRoute="/instances/$instanceId"
      section={section}
    />
  );
}

const databasePage = (
  <BackendDatabasePage
    databaseId={CONSOLE_DATABASE_ID}
    instanceId={CONSOLE_INSTANCE_ID}
    section="overview"
  />
);

const extensionsPage = (
  <BackendDatabaseExtensionsPage
    databaseId={CONSOLE_DATABASE_ID}
    instanceId={CONSOLE_INSTANCE_ID}
    searchRoute="/instances/$instanceId/databases/$databaseId/extensions"
  />
);

function cardRect(label: string) {
  const card = screen.getByText(label).closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected ${label} card`);
  }
  return card.getBoundingClientRect();
}

async function openQueryInsightsDrawer(
  insights: ConsoleResourceFixture["queryInsights"]
) {
  await renderConsolePage(databasePage, { queryInsights: insights });
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  return page.getByRole("dialog", { name: "Query insights" });
}

test("backend instance page explains unavailable server info", async () => {
  await renderConsolePage(<InstancePage section="overview" />, {
    serverInfoError: "failed to query server info",
  });

  await expect.element(page.getByText("Server info unavailable")).toBeVisible();
  await expect
    .element(
      page.getByText(
        "Querylane is connected, but couldn’t load live server details: failed to query server info"
      )
    )
    .toBeVisible();
});

test("backend instance overview shows live metrics and database catalog together", async () => {
  await renderConsolePage(<InstancePage section="overview" />);

  await expect
    .element(page.getByText("Production Analytics Writer"))
    .toBeVisible();
  const health = page.getByRole("region", { name: "Health checks" });
  await expect
    .element(health.getByRole("button", { name: REPLICATION_ROW_NAME }))
    .toBeVisible();
  await expect
    .element(health.getByText("primary with 2 attached replicas"))
    .toBeVisible();
  await expect
    .element(page.getByRole("region", { name: "Replication overview" }))
    .not.toBeAttached();
  await expect
    .element(page.getByRole("img", { name: "74 of 100 connections in use" }))
    .toBeVisible();
  await health.getByRole("button", { name: REPLICATION_ROW_NAME }).click();
  await expect
    .element(health.getByText("Primary", { exact: true }))
    .toBeVisible();
  await expect.element(health.getByText("Streaming replicas")).toBeVisible();
  await expect
    .element(page.getByPlaceholder("Search databases…"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Kind" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Encoding" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Owner" }))
    .toBeVisible();
  await expect.element(page.getByText("customer_events")).toBeVisible();
});

test("instance overview keeps cached catalog visible during a meta database outage", async () => {
  const fixture = await renderConsolePage(<InstancePage section="overview" />);
  await expect
    .element(page.getByRole("img", { name: "74 of 100 connections in use" }))
    .toBeVisible();

  fixture.metaDatabaseUnavailable = true;
  await page.getByRole("button", { name: "Refresh data" }).click();

  await expect
    .element(page.getByText("Meta database unavailable"))
    .toBeVisible();
  await expect.element(page.getByText("Status unavailable")).toBeVisible();
  await expect.element(page.getByText("customer_events")).toBeVisible();
  await expect
    .element(
      page.getByText("Showing the last loaded data until refresh succeeds.")
    )
    .toBeVisible();
  await expect
    .element(page.getByText("Connected", { exact: true }))
    .toHaveCount(0);
});

test("backend instance activity matches the live sessions redesign", async () => {
  await renderConsolePage(
    <InstancePage section="activity" />,
    { activity: busyActivity },
    "w-[1160px] p-6"
  );

  await expect
    .element(page.getByRole("heading", { name: "Activity" }))
    .toBeVisible();
  await expect.element(page.getByText("Blocking chains")).toBeVisible();
  await expect.element(page.getByText("blocker · pid 4211")).toBeVisible();
  await expect.element(page.getByText("PID", { exact: true })).toBeVisible();
  await expect.element(page.getByText("User · app")).toBeVisible();
  const search = page.getByRole("textbox", {
    name: "Search query, user, app…",
  });
  const stateFilter = page.getByRole("button", {
    exact: true,
    name: "State",
  });
  const appFilter = page.getByRole("button", {
    exact: true,
    name: "App",
  });
  const databaseFilter = page.getByRole("button", {
    exact: true,
    name: "DB",
  });
  await expect.element(search).toBeVisible();
  await expect.element(stateFilter).toBeVisible();
  await expect.element(appFilter).toBeVisible();
  await expect.element(databaseFilter).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect.element(page.getByText("Showing 1–5 of 5")).toBeVisible();

  const searchBox = screen
    .getByRole("textbox", { name: "Search query, user, app…" })
    .getBoundingClientRect();
  const filterBoxes = ["State", "App", "DB"].map((name) =>
    screen.getByRole("button", { name }).getBoundingClientRect()
  );
  expect(searchBox.right).toBeLessThan(filterBoxes[0]?.left ?? 0);
  expect(filterBoxes[0]?.right ?? 0).toBeLessThan(filterBoxes[1]?.left ?? 0);
  expect(filterBoxes[1]?.right ?? 0).toBeLessThan(filterBoxes[2]?.left ?? 0);
  for (const filterBox of filterBoxes) {
    expect(Math.abs(searchBox.top - filterBox.top)).toBeLessThanOrEqual(1);
  }
  await expect
    .element(
      page.getByRole("button", {
        name: BLOCKED_ACTIVITY_ROW_NAME,
      })
    )
    .toBeVisible();
  await expect
    .poll(
      () =>
        document.querySelectorAll(
          'code.language-sql[data-syntax-highlighter="shiki"]'
        ).length
    )
    .toBe(8);
  const waitingSql = screen
    .getByText("waiting · pid 4302")
    .parentElement?.querySelector("code.language-sql");
  if (!waitingSql) {
    throw new Error("Missing highlighted waiting-session SQL");
  }
  const waitingSqlContainer = waitingSql.closest(".opacity-80");
  if (!waitingSqlContainer) {
    throw new Error("Missing muted waiting-session SQL container");
  }
  expect(getComputedStyle(waitingSqlContainer).opacity).toBe("0.8");
  const tableSql = document.querySelector(
    'table code.language-sql[data-syntax-highlighter="shiki"]'
  );
  if (!tableSql) {
    throw new Error("Missing highlighted table SQL");
  }
  const tableSqlContainer = tableSql.parentElement;
  if (!tableSqlContainer) {
    throw new Error("Missing highlighted table SQL container");
  }
  const tableSqlStyle = getComputedStyle(tableSqlContainer);
  expect(tableSqlStyle.overflow).toBe("hidden");
  expect(tableSqlStyle.textOverflow).toBe("ellipsis");
  expect(tableSqlStyle.whiteSpace).toBe("nowrap");
  expect(tableSqlContainer.scrollWidth).toBeGreaterThan(
    tableSqlContainer.clientWidth
  );

  await page.getByRole("button", { name: BLOCKED_ACTIVITY_ROW_NAME }).click();
  const inspector = page.getByRole("dialog", { name: "Session 4302" });
  await expect.element(inspector).toBeVisible();
  await expect
    .element(
      page.getByText("app_readwrite · api-gateway · logistics · 10.2.0.8:55432")
    )
    .toBeVisible();
  await expect.element(page.getByText("1h 0m ago")).toBeVisible();
  await expect.element(page.getByText("Lock · transactionid")).toBeVisible();
  await expect.element(page.getByText("blocked by · pid 4211")).toBeVisible();
  const timeline = screen
    .getByRole("dialog", { name: "Session 4302" })
    .querySelector("ol");
  if (!timeline) {
    throw new Error("Missing session timeline");
  }
  const timelineRect = timeline.getBoundingClientRect();
  const timelineStyle = getComputedStyle(timeline);
  const lineCenter =
    timelineRect.left + Number.parseFloat(timelineStyle.borderLeftWidth) / 2;
  for (const item of timeline.children) {
    const marker = item.querySelector<HTMLElement>('[aria-hidden="true"]');
    if (!marker) {
      throw new Error("Missing session timeline marker");
    }
    const itemRect = item.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    expect(
      Math.abs(markerRect.left + markerRect.width / 2 - lineCenter)
    ).toBeLessThanOrEqual(0.1);
    expect(
      Math.abs(
        markerRect.top +
          markerRect.height / 2 -
          (itemRect.top + itemRect.height / 2)
      )
    ).toBeLessThanOrEqual(0.1);
  }
  expect(timeline.children.length).toBeGreaterThan(0);
  await expect
    .element(page.getByRole("button", { name: "Terminate session…" }))
    .not.toBeAttached();
  await page.getByRole("button", { name: "Close" }).click();
});

test("background activity refresh keeps the table fixed in place", async () => {
  const fixture = await renderConsolePage(
    <InstancePage section="activity" />,
    { activity: busyActivity },
    "w-[1160px] p-6"
  );
  await expect.element(page.getByText("Showing 1–5 of 5")).toBeVisible();
  const settledTableBox = screen.getByRole("table").getBoundingClientRect();

  fixture.pending = ["checkInstanceActivity"];
  const refresh = page.getByRole("button", { name: "Refresh activity" });
  await refresh.click();
  await expect.element(refresh).toBeDisabled();

  const refreshingTableBox = screen.getByRole("table").getBoundingClientRect();
  expect(refreshingTableBox.top).toBe(settledTableBox.top);
  expect(refreshingTableBox.height).toBe(settledTableBox.height);
});

test("backend instance activity empty state matches", async () => {
  await renderConsolePage(
    <InstancePage section="activity" />,
    {},
    "w-[1160px] p-6"
  );

  await expect.element(page.getByText("No sessions found")).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Rows per page" }))
    .toBeVisible();
  await expect.element(page.getByText("Page 1 of 1")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Previous page" }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Next page" }))
    .toBeDisabled();
});

test("backend instance activity unavailable state matches", async () => {
  await renderConsolePage(
    <InstancePage section="activity" />,
    { activity: null },
    "w-[1160px] p-6"
  );

  await expect
    .element(page.getByText("Activity data unavailable"))
    .toBeVisible();
});

test("backend instance activity disconnected state matches", async () => {
  state.selectedInstanceStatus = "disconnected";
  await renderConsolePage(
    <InstancePage section="activity" />,
    { activity: busyActivity },
    "w-[1160px] p-6"
  );

  await expect.element(page.getByText("Activity unavailable")).toBeVisible();
  await expect.element(page.getByText("Loading activity…")).not.toBeAttached();
});

test("backend database overview shows mission control stats and catalog tables", async () => {
  await renderConsolePage(databasePage);

  await expect
    .element(page.getByRole("heading", { name: "customer_events" }))
    .toBeVisible();
  await expect.element(page.getByText("Top tables")).toBeVisible();
  await expect.element(page.getByText("daily_rollup")).toBeVisible();
  await expect
    .element(page.getByText("Schemas", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("Databases on this instance"))
    .toBeVisible();
  await expect.element(page.getByText("orders")).toBeVisible();
  await expect
    .element(page.getByText("Query statistics are off"))
    .toBeVisible();

  const slowQueries = cardRect("Slowest queries");
  const topTables = cardRect("Top tables");
  const schemas = cardRect("Schemas");
  const otherDatabases = cardRect("Databases on this instance");

  expect.soft(Math.abs(slowQueries.bottom - topTables.bottom)).toBeLessThan(1);
  expect.soft(Math.abs(schemas.top - otherDatabases.top)).toBeLessThan(1);
  expect.soft(Math.abs(schemas.bottom - otherDatabases.bottom)).toBeLessThan(1);
});

test("backend database overview qualifies a bounded catalog sample", async () => {
  await renderConsolePage(databasePage, { schemasTruncated: true });

  await expect
    .element(
      page.getByRole("status", { name: "Some catalog data is not shown" })
    )
    .toBeVisible();
  await expect.element(page.getByText("2+ schemas")).toBeVisible();
  await expect.element(page.getByText("partial sample")).toBeVisible();
});

test("dense schema inventories use the wide row without layout holes", async () => {
  const schemaIds = Array.from(
    { length: DENSE_SCHEMA_COUNT },
    (_, index) => `schema_${index}`
  );
  await renderConsolePage(databasePage, {
    catalog: {
      ...consoleCatalog,
      schemas: schemaIds.map(catalogSchema),
      tables: Object.fromEntries(
        schemaIds.map((id) => [
          id,
          [catalogTable(id, "events", { rowCount: 1n, sizeBytes: 1n })],
        ])
      ),
    },
  });

  await expect
    .element(page.getByText("Schemas", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("schema_11", { exact: true }))
    .toBeVisible();

  const schemas = cardRect("Schemas");
  const otherDatabases = cardRect("Databases on this instance");
  expect.soft(schemas.width).toBeGreaterThan(otherDatabases.width);
  expect.soft(Math.abs(schemas.top - otherDatabases.top)).toBeLessThan(1);
  expect.soft(Math.abs(schemas.bottom - otherDatabases.bottom)).toBeLessThan(1);
});

test("disabled Insights explains why statistics are unavailable", async () => {
  await renderConsolePage(databasePage);

  const button = page.getByRole("button", { name: "Insights", exact: true });
  await expect.element(button).toBeDisabled();
  await page
    .locator("[data-base-ui-tooltip-trigger]")
    .filter({ has: button })
    .hover();
  await expect
    .element(
      page.getByText(
        "Insights are unavailable because PostgreSQL query and table statistics cannot be queried. Install pg_stat_statements or grant statistics access, then refresh."
      )
    )
    .toBeVisible();
});

test("backend database overview opens the query insights drawer", async () => {
  await renderConsolePage(databasePage, { queryInsights: queryInsights() });

  await expect
    .element(page.getByText("Top queries by total time"))
    .not.toBeAttached();
  await page.getByRole("button", { name: "Insights", exact: true }).click();

  const drawer = page.getByRole("dialog", { name: "Query insights" });
  await expect.element(drawer).toBeVisible();
  await expect
    .element(page.getByText("Top queries by total time"))
    .toBeVisible();
  await expect
    .element(page.getByText("Sequential scan hotspots"))
    .toBeVisible();
  await expect.element(page.getByText("Cache hit by table")).toBeVisible();
});

test("query insights active filters match the shared toolbar", async () => {
  const drawer = await openQueryInsightsDrawer(queryInsights());
  await expect.element(drawer).toBeVisible();

  await drawer.getByRole("textbox", { name: "Search queries…" }).fill("SELECT");
  await drawer.getByRole("button", { name: "Type" }).click();
  await page.getByRole("option", { name: "Read queries" }).click();
  await drawer.getByText("Top queries by total time").click();

  await expect
    .element(drawer.getByRole("button", { name: "Type Read queries" }))
    .toBeVisible();
  await expect
    .element(drawer.getByRole("button", { name: "Clear all" }))
    .toBeVisible();
});

test("query insights drawer caps its width at 64rem", async () => {
  const drawer = await openQueryInsightsDrawer(queryInsights());
  await expect.element(drawer).toBeVisible();
  await expect.element(drawer).toHaveCSS("max-width", "1024px");
});

test("partial query insights use the full drawer content width", async () => {
  const drawer = await openQueryInsightsDrawer(
    queryInsights({ queryStatsAvailable: false })
  );
  await expect.element(drawer).toBeVisible();

  const topQueriesCard = screen
    .getByText("Top queries by total time")
    .closest('[data-slot="card"]');
  if (!(topQueriesCard instanceof HTMLElement)) {
    throw new Error("Expected top queries card");
  }

  const drawerBox = screen
    .getByRole("dialog", { name: "Query insights" })
    .getBoundingClientRect();
  const cardBox = topQueriesCard.getBoundingClientRect();
  expect(drawerBox.right - cardBox.right).toBeLessThanOrEqual(32);
});

test("query statistics retry uses the default button size", async () => {
  const drawer = await openQueryInsightsDrawer(
    queryInsights({ queryStatsAvailable: false })
  );
  await expect.element(drawer).toBeVisible();

  const retryButton = page.getByRole("button", {
    name: "Retry query statistics",
  });
  await expect.element(retryButton).toBeVisible();
  expect(
    screen
      .getByRole("button", { name: "Retry query statistics" })
      .getBoundingClientRect().height
  ).toBe(36);
});

test("backend database extensions page matches design source", async () => {
  await renderConsolePage(extensionsPage, { extensions: designExtensions });

  await expect
    .element(page.getByRole("heading", { name: "Extensions" }))
    .toBeVisible();
  await expect.element(page.getByText("pg_stat_statements")).toBeVisible();
  await expect.element(page.getByText("Observability")).toBeVisible();
});

test("backend database extensions toolbar stays contained on narrow screens", async () => {
  await renderConsolePage(
    extensionsPage,
    { extensions: designExtensions },
    "w-[320px] p-4"
  );

  await expect.element(page.getByRole("tablist")).toBeVisible();

  const surfaceBox = screen.getByTestId("console-page").getBoundingClientRect();
  const searchBox = screen
    .getByRole("textbox", { name: "Search extensions…" })
    .getBoundingClientRect();
  const tabsBox = screen.getByRole("tablist").getBoundingClientRect();

  expect(searchBox.right).toBeLessThanOrEqual(surfaceBox.right);
  expect(tabsBox.left).toBeGreaterThanOrEqual(surfaceBox.left);
  expect(tabsBox.right).toBeLessThanOrEqual(surfaceBox.right);
});

test("backend database extensions drawer matches design source", async () => {
  await renderConsolePage(extensionsPage, { extensions: designExtensions });

  await page
    .getByRole("button", { name: PG_STAT_STATEMENTS_BUTTON_NAME })
    .click();

  const drawer = page.getByRole("dialog", {
    name: "pg_stat_statements details",
  });
  await expect.element(drawer).toBeVisible();
  await expect
    .element(page.getByText(SHARED_PRELOAD_LIBRARIES_TEXT))
    .toBeVisible();

  await drawer.getByRole("button", { name: "What it gives you" }).click();

  await expect.element(page.getByText("pg_stat_statements view")).toBeVisible();
  await expect.element(page.getByText("track_planning setting")).toBeVisible();
});

test("backend database extensions available drawer matches design source", async () => {
  await renderConsolePage(extensionsPage, { extensions: designExtensions });

  await page
    .getByRole("textbox", { name: "Search extensions…" })
    .fill("timescaledb");
  await expect.element(page.getByText("Time-series")).toBeVisible();
  await expect.element(page.getByText("1 of 7 extensions")).toBeVisible();

  await page.getByRole("button", { name: TIMESCALEDB_BUTTON_NAME }).click();

  const drawer = page.getByRole("dialog", { name: "timescaledb details" });
  await expect.element(drawer).toBeVisible();
  await expect
    .element(page.getByText("Not installed in this database"))
    .toBeVisible();
});

test("backend instance delete navigates without waiting for catalog refresh", async () => {
  // The catalog refresh after delete never answers.
  await renderConsolePage(<InstancePage section="configuration" />, {
    pending: ["listInstances"],
  });

  await page
    .getByTestId("instance-danger-zone")
    .getByRole("button", { name: "Delete instance" })
    .click();
  await page
    .getByLabel(`Type instances/${CONSOLE_INSTANCE_ID} to confirm`)
    .fill(`instances/${CONSOLE_INSTANCE_ID}`);
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete instance" })
    .click();

  await expect.poll(() => state.navigate.mock.calls.length).toBe(1);
  expect(state.navigate).toHaveBeenCalledWith({ replace: true, to: "/" });
});
