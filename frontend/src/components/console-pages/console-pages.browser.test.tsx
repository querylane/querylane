import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import * as actualRouter from "@tanstack/react-router" with {
  rstest: "importActual",
};
import { screen } from "@testing-library/dom";
import type { ReactNode } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import { RoleDetailPage } from "@/components/console-pages/role-detail-page";
import { DatabaseService } from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  GrantObjectType,
  RoleService,
} from "@/protogen/querylane/console/v1alpha1/role_pb";
import {
  accessMapFixture,
  ROLE_FIXTURE_INSTANCE_ID,
  ROLES_TABLE_ROLES,
  type RoleFixture,
  role,
  roleDetailFixture,
  roleFixtureServices,
} from "@/test/fixtures/role-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import {
  ConsoleEmptyStatesScenario,
  ConsolePageErrorScenario,
  ConsoleResourceOverviewScenario,
  ConsoleSqlstateScenario,
} from "@/visual-harness/console-scenarios";
import { HarnessProviders } from "@/visual-harness/harness-providers";
import { SQLSTATE_SCENARIOS } from "@/visual-harness/sqlstate-scenarios";

rs.mock("@tanstack/react-router", () => {
  const linkExportName = "Link";
  return {
    ...actualRouter,
    [linkExportName]: ({
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
        pathname: `/instances/${ROLE_FIXTURE_INSTANCE_ID}/roles`,
        searchStr: "",
      };
      return select ? select(location) : location;
    },
    useNavigate: () => () => undefined,
    useSearch: ({
      select,
    }: {
      select?: (search: Record<string, unknown>) => unknown;
    } = {}) => (select ? select({}) : {}),
  };
});

rs.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: [
      { id: "appdb", name: "appdb" },
      { id: "analytics", name: "analytics" },
    ],
    selectedDatabase: { id: "appdb", name: "appdb" },
  }),
}));

async function renderScenario(scenario: ReactNode) {
  await render(<ScreenshotFrame>{scenario}</ScreenshotFrame>);
}

async function renderConsoleSurface(
  children: ReactNode,
  fixture: RoleFixture = accessMapFixture({ roles: ROLES_TABLE_ROLES })
) {
  const services = roleFixtureServices(fixture);
  const transport = createTestRouterTransport((router) => {
    router.service(DatabaseService, services.database);
    router.service(RoleService, services.role);
  });
  await render(
    <HarnessProviders transport={transport}>
      <ScreenshotFrame>
        <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
          {children}
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );
}

function RolesPage({ tab }: { tab?: "map" }) {
  return (
    <InstanceRolesPage
      instanceId={ROLE_FIXTURE_INSTANCE_ID}
      searchRoute="/instances/$instanceId/roles/"
      tab={tab}
    />
  );
}

function RoleDetail({
  grantsSchema,
  grantsType,
  tab,
}: {
  grantsSchema?: string;
  grantsType?: "tables";
  tab: "access-map" | "definition" | "grants" | "members" | "overview";
}) {
  return (
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema={grantsSchema}
      grantsType={grantsType}
      instanceId={ROLE_FIXTURE_INSTANCE_ID}
      roleId="app_user"
      tab={tab}
    />
  );
}

test("console resource overview keeps dense metadata readable", async () => {
  await renderScenario(<ConsoleResourceOverviewScenario />);

  await expect
    .element(page.getByRole("heading", { name: "Production Analytics Writer" }))
    .toBeVisible();
  await expect
    .element(page.getByText("analytics-writer.internal.querylane.test"))
    .toBeVisible();
});

test("console roles list shows an inline type filter, sortable columns, and role rows", async () => {
  await renderConsoleSurface(<RolesPage />);

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Roles" }))
    .toBeVisible();
  await expect.element(page.getByRole("tab", { name: "Table" })).toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: "Access map" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Type" }))
    .toBeVisible();
  const tabList = screen.getByRole("tablist");
  const search = screen.getByPlaceholderText("Search roles…");
  const typeFilter = screen.getByRole("button", { name: "Type" });
  expect(typeFilter.getBoundingClientRect().left).toBeGreaterThan(
    search.getBoundingClientRect().right
  );
  expect(tabList.getBoundingClientRect().left).toBeGreaterThan(
    typeFilter.getBoundingClientRect().right
  );
  expect(
    Math.abs(
      typeFilter.getBoundingClientRect().top -
        search.getBoundingClientRect().top
    )
  ).toBeLessThanOrEqual(1);
  const tabListRect = tabList.getBoundingClientRect();
  const searchRect = search.getBoundingClientRect();
  expect(
    Math.abs(
      tabListRect.top +
        tabListRect.height / 2 -
        (searchRect.top + searchRect.height / 2)
    )
  ).toBeLessThanOrEqual(1);
  await expect
    .element(page.getByText("postgres", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("app_user", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByPlaceholder("Search roles…")).toBeVisible();
});

test("console roles access map matches the design source", async () => {
  await renderConsoleSurface(<RolesPage tab="map" />, accessMapFixture());

  await expect
    .element(page.getByText("cloud_admin", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("app_readwrite", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("PUBLIC", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("pg_monitor", { exact: true }))
    .not.toBeAttached();
  await expect
    .element(page.getByText("logistics", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("shipping", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "View" }).click();
  await expect.element(page.getByText("Access filters")).toBeVisible();
  await expect.element(page.getByText("Built-in roles")).toBeVisible();
  await expect
    .element(page.getByText("Show 1 PostgreSQL-provided role."))
    .toBeVisible();
  await expect.element(page.getByText("Default privileges")).toBeVisible();
  await page.getByRole("button", { name: "View" }).click();

  await page
    .getByRole("button", { name: "Trace access for cloud_admin" })
    .click();
});

test("console roles dense access map starts with reduced edge filters", async () => {
  await renderConsoleSurface(
    <RolesPage tab="map" />,
    accessMapFixture({ extraDirectGrantCount: 5 })
  );

  const viewButton = page.getByRole("button", {
    name: "View, 3 filters hidden",
  });
  await expect.element(viewButton).toBeVisible();

  await viewButton.click();
  await Promise.all(
    Object.entries({
      "Default privileges": "true",
      "Direct grants": "false",
      Members: "false",
      "Owned objects": "false",
      "Public grants": "true",
    }).map(([name, checked]) =>
      expect
        .element(page.getByRole("switch", { name }))
        .toHaveAttribute("aria-checked", checked)
    )
  );
});

test("console roles access map keeps partial results visibly qualified", async () => {
  await renderConsoleSurface(
    <RolesPage tab="map" />,
    accessMapFixture({ truncated: ["listRoleGrants"] })
  );

  await expect
    .element(page.getByText("Some access data is not shown"))
    .toBeVisible();
  await expect
    .element(page.getByText("shipping", { exact: true }))
    .toBeVisible();

  await page.getByRole("button", { name: "Maximize role access map" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Expanded role access map",
  });
  await expect
    .element(dialog.getByText("Some access data is not shown"))
    .toBeVisible();
});

test("console roles access map keeps failed requests visible when expanded", async () => {
  await renderConsoleSurface(
    <RolesPage tab="map" />,
    accessMapFixture({ failing: ["listRoleGrants:app_readonly@logistics"] })
  );

  await page.getByRole("button", { name: "Maximize role access map" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Expanded role access map",
  });
  await expect
    .element(
      dialog.getByText(
        "1 access request could not be loaded. The map shows the available data."
      )
    )
    .toBeVisible();
});

test("console roles access map does not show an empty state while loading", async () => {
  await renderConsoleSurface(
    <RolesPage tab="map" />,
    accessMapFixture({ pending: ["listRoleGrants"] })
  );

  await expect
    .element(page.getByText("Loading role object access."))
    .toBeVisible();
  await expect
    .element(page.getByText("No object grants found for the visible roles."))
    .not.toBeAttached();
});

test("console roles login no state keeps the same indicator slot", async () => {
  await renderConsoleSurface(
    <RolesPage />,
    accessMapFixture({
      roles: [role({ attributes: { canLogin: false }, roleName: "app_group" })],
    })
  );

  await expect.element(page.getByText("No", { exact: true })).toBeVisible();
  const noLabel = screen.getByText("No", { exact: true });
  expect(noLabel.previousElementSibling).not.toBeNull();
});

test("console SQLSTATE error surfaces keep common PostgreSQL failures scannable", async () => {
  await renderScenario(<ConsoleSqlstateScenario />);

  await expect
    .element(page.getByRole("heading", { name: "SQLSTATE diagnostics" }))
    .toBeVisible();

  async function checkScenario(index: number): Promise<void> {
    const scenario = SQLSTATE_SCENARIOS[index];
    if (!scenario) {
      return;
    }

    const section = page.getByTestId(`sqlstate-scenario-${scenario.slug}`);
    await section.getByRole("button", { name: "Error details" }).click();
    await expect
      .element(
        page.getByText(`SQLSTATE: ${scenario.sqlstate}`, { exact: true })
      )
      .toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect
      .element(page.getByText(`SQLSTATE: ${scenario.sqlstate}`))
      .not.toBeAttached();

    await checkScenario(index + 1);
  }

  await checkScenario(0);
});

test("console empty states distinguish config-managed and user-actionable gaps", async () => {
  await renderScenario(<ConsoleEmptyStatesScenario />);

  await expect.element(page.getByText("No instances configured")).toBeVisible();
  await expect.element(page.getByText("No databases found")).toBeVisible();
});

test("console page error keeps recovery actions and diagnostics scannable", async () => {
  await renderScenario(<ConsolePageErrorScenario />);

  await expect.element(page.getByText("Request failed")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Retry metadata" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Error details" }))
    .toBeVisible();

  await page.getByRole("button", { name: "Error details" }).click();
  await expect.element(page.getByText("Technical details")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy details" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy as cURL" }))
    .not.toBeAttached();
});

test("console role detail overview shows access sources and attributes", async () => {
  await renderConsoleSurface(
    <RoleDetail tab="overview" />,
    roleDetailFixture()
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect.element(page.getByText("Role attributes")).toBeVisible();
  await expect.element(page.getByText("Access", { exact: true })).toBeVisible();
});

test("console role detail grants overview keeps access sources scannable", async () => {
  await renderConsoleSurface(<RoleDetail tab="grants" />, roleDetailFixture());

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Direct grants", { exact: true }).first())
    .toBeVisible();
});

test("console role schema grants capture active shared filters", async () => {
  await renderConsoleSurface(
    <RoleDetail grantsSchema="public" grantsType="tables" tab="grants" />,
    roleDetailFixture({
      extraGrants: [
        {
          grantor: "postgres",
          objectName: "recent_orders",
          objectType: GrantObjectType.VIEW,
          privilege: "SELECT",
          schemaName: "public",
          withGrantOption: false,
        },
      ],
    })
  );

  await page.getByRole("textbox", { name: "Search objects…" }).fill("orders");
  await expect
    .element(page.getByRole("button", { name: "Kind Table" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Clear all" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "public.orders" }))
    .toBeVisible();
  await expect
    .element(page.getByText("recent_orders", { exact: true }))
    .not.toBeAttached();
});

test("console role detail access map keeps partial counts qualified", async () => {
  await renderConsoleSurface(
    <RoleDetail tab="access-map" />,
    roleDetailFixture({
      truncated: ["listPublicGrants", "listRoleGrants", "listRoleOwnedObjects"],
    })
  );

  await expect
    .element(page.getByText("Some access data is not shown"))
    .toBeVisible();
  await expect
    .element(page.getByText("Partial", { exact: true }))
    .toHaveCount(5);

  await page.getByRole("button", { name: "Expand access map" }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded access map" });
  await expect.element(dialog).toBeVisible();
});

test("console role detail membership shows inherited and child roles", async () => {
  await renderConsoleSurface(<RoleDetail tab="members" />, roleDetailFixture());

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect.element(page.getByText("Inherits from")).toBeVisible();
  await expect
    .element(page.getByText("Members", { exact: true }).first())
    .toBeVisible();
  await expect.element(page.getByText("reporting_reader")).toBeVisible();
});

test("console role detail definition shows reconstructed SQL", async () => {
  await renderConsoleSurface(
    <RoleDetail tab="definition" />,
    roleDetailFixture()
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect.element(page.getByText("SQL definition")).toBeVisible();
});
