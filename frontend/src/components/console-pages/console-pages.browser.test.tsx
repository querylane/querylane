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
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
} from "@/protogen/querylane/console/v1alpha1/role_pb";
import {
  ConsoleEmptyStatesScenario,
  ConsolePageErrorScenario,
  ConsoleResourceOverviewScenario,
  ConsoleSqlstateScenario,
} from "@/visual-harness/console-scenarios";
import { SQLSTATE_SCENARIOS } from "@/visual-harness/sqlstate-scenarios";

const roleApiState = rs.hoisted(() => ({
  accessMapPending: false,
  accessMapResources: null as null | {
    budgetSkippedRequestCount: number;
    failedRequestCount: number;
    publicAccess: unknown[];
    roleAccess: unknown[];
    truncatedRequestCount: number;
  },
  defaultPrivileges: [] as unknown[],
  defaultPrivilegesNextPageToken: "",
  grants: [] as unknown[],
  grantsNextPageToken: "",
  ownedObjects: [] as unknown[],
  ownedObjectsNextPageToken: "",
  publicGrants: [] as unknown[],
  publicGrantsNextPageToken: "",
  roles: [] as unknown[],
}));

function roleFixture(overrides: Record<string, unknown> = {}) {
  return {
    attributes: {
      bypassesRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      canReplicate: false,
      connectionLimit: -1,
      inheritsByDefault: true,
      isSuperuser: false,
    },
    comment: "Primary application login role.",
    isSystemRole: false,
    memberOf: [
      {
        adminOption: false,
        grantor: "postgres",
        grantorRole: "instances/prod/roles/postgres",
        inheritOption: true,
        role: "instances/prod/roles/app_writer",
        roleName: "app_writer",
        setOption: true,
      },
    ],
    name: "instances/prod/roles/app_user",
    roleName: "app_user",
    ...overrides,
  };
}

function setRoleDetailFixture() {
  roleApiState.defaultPrivilegesNextPageToken = "";
  roleApiState.grantsNextPageToken = "";
  roleApiState.ownedObjectsNextPageToken = "";
  roleApiState.publicGrantsNextPageToken = "";
  roleApiState.roles = [
    roleFixture(),
    roleFixture({
      attributes: {
        bypassesRls: false,
        canCreateDatabase: false,
        canCreateRole: false,
        canLogin: false,
        canReplicate: false,
        connectionLimit: -1,
        inheritsByDefault: true,
        isSuperuser: false,
      },
      comment: "Application write group.",
      memberOf: [],
      name: "instances/prod/roles/app_writer",
      roleName: "app_writer",
    }),
    roleFixture({
      memberOf: [
        {
          adminOption: false,
          grantor: "postgres",
          grantorRole: "instances/prod/roles/postgres",
          inheritOption: true,
          role: "instances/prod/roles/app_user",
          roleName: "app_user",
          setOption: true,
        },
      ],
      name: "instances/prod/roles/reporting_reader",
      roleName: "reporting_reader",
    }),
  ];
  roleApiState.grants = [
    {
      grantor: "postgres",
      objectName: "orders",
      objectType: GrantObjectType.TABLE,
      privilege: "SELECT",
      schemaName: "public",
      withGrantOption: false,
    },
    {
      grantor: "postgres",
      objectName: "orders",
      objectType: GrantObjectType.TABLE,
      privilege: "UPDATE",
      schemaName: "public",
      withGrantOption: false,
    },
    {
      grantor: "postgres",
      objectName: "daily_revenue",
      objectType: GrantObjectType.VIEW,
      privilege: "SELECT",
      schemaName: "analytics",
      withGrantOption: true,
    },
  ];
  roleApiState.ownedObjects = [
    {
      objectName: "job_runs",
      objectType: GrantObjectType.TABLE,
      schemaName: "internal",
    },
  ];
  roleApiState.publicGrants = [
    {
      grantor: "postgres",
      objectName: "",
      objectType: GrantObjectType.SCHEMA,
      privilege: "USAGE",
      schemaName: "public",
      withGrantOption: false,
    },
  ];
  roleApiState.defaultPrivileges = [
    {
      creatorRole: "instances/prod/roles/app_owner",
      creatorRoleName: "app_owner",
      objectType: DefaultPrivilegeObjectType.TABLES,
      privilege: "SELECT",
      schemaName: "analytics",
      withGrantOption: false,
    },
  ];
}

function roleAttributes(overrides: Record<string, unknown> = {}) {
  return {
    bypassesRls: false,
    canCreateDatabase: false,
    canCreateRole: false,
    canLogin: true,
    canReplicate: false,
    connectionLimit: -1,
    inheritsByDefault: true,
    isSuperuser: false,
    ...overrides,
  };
}

function roleMembership(roleName: string) {
  return {
    adminOption: false,
    grantor: "postgres",
    grantorRole: "instances/prod/roles/postgres",
    inheritOption: true,
    role: `instances/prod/roles/${roleName}`,
    roleName,
    setOption: true,
  };
}

function setRolesAccessMapDesignFixture(extraDirectGrantCount = 0) {
  // Mirrors the unzipped design source: ROLES screen `AMAP_ROLES`,
  // `AMAP_OBJS`, and `AMAP_EDGES`.
  roleApiState.roles = [
    roleFixture({
      attributes: roleAttributes({ isSuperuser: true }),
      memberOf: [],
      name: "instances/prod/roles/cloud_admin",
      roleName: "cloud_admin",
    }),
    roleFixture({
      attributes: roleAttributes(),
      memberOf: [],
      name: "instances/prod/roles/app_owner",
      roleName: "app_owner",
    }),
    roleFixture({
      attributes: roleAttributes(),
      memberOf: [roleMembership("app_owner")],
      name: "instances/prod/roles/app_readwrite",
      roleName: "app_readwrite",
    }),
    roleFixture({
      attributes: roleAttributes(),
      memberOf: [],
      name: "instances/prod/roles/app_readonly",
      roleName: "app_readonly",
    }),
    roleFixture({
      attributes: roleAttributes(),
      memberOf: [roleMembership("app_readonly")],
      name: "instances/prod/roles/analytics_reader",
      roleName: "analytics_reader",
    }),
    roleFixture({
      attributes: roleAttributes(),
      memberOf: [roleMembership("app_owner")],
      name: "instances/prod/roles/deploy_bot",
      roleName: "deploy_bot",
    }),
    roleFixture({
      attributes: roleAttributes({ canLogin: false }),
      memberOf: [roleMembership("pg_monitor")],
      name: "instances/prod/roles/dba_admins",
      roleName: "dba_admins",
    }),
    roleFixture({
      attributes: roleAttributes({ canLogin: false }),
      isSystemRole: true,
      memberOf: [],
      name: "instances/prod/roles/pg_monitor",
      roleName: "pg_monitor",
    }),
  ];
  roleApiState.accessMapResources = {
    budgetSkippedRequestCount: 0,
    failedRequestCount: 0,
    publicAccess: [
      {
        databaseId: "functions",
        databaseName: "functions",
        grants: [
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "USAGE · EXECUTE on functions",
            schemaName: "public",
            withGrantOption: false,
          },
        ],
      },
    ],
    roleAccess: [
      {
        databaseId: "logistics",
        databaseName: "logistics",
        defaultPrivileges: [],
        grants: [],
        ownedObjects: [
          {
            objectName: "logistics",
            objectType: GrantObjectType.DATABASE,
            schemaName: "",
          },
        ],
        roleId: "app_owner",
        roleName: "app_owner",
      },
      {
        databaseId: "logistics",
        databaseName: "logistics",
        defaultPrivileges: [
          {
            creatorRole: "instances/prod/roles/app_owner",
            creatorRoleName: "app_owner",
            objectType: DefaultPrivilegeObjectType.TABLES,
            privilege: "SELECT",
            schemaName: "shipping",
            withGrantOption: false,
          },
        ],
        grants: [
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "SELECT on all tables",
            schemaName: "shipping",
            withGrantOption: false,
          },
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "SELECT on all tables",
            schemaName: "catalog",
            withGrantOption: false,
          },
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "SELECT on all tables",
            schemaName: "audit",
            withGrantOption: false,
          },
          ...Array.from({ length: extraDirectGrantCount }, (_, index) => ({
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "USAGE",
            schemaName: `extra_${index}`,
            withGrantOption: false,
          })),
        ],
        ownedObjects: [],
        roleId: "app_readonly",
        roleName: "app_readonly",
      },
      {
        databaseId: "logistics",
        databaseName: "logistics",
        defaultPrivileges: [],
        grants: [
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "SELECT · INSERT · UPDATE · DELETE",
            schemaName: "shipping",
            withGrantOption: false,
          },
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "SELECT · INSERT · UPDATE · DELETE",
            schemaName: "catalog",
            withGrantOption: false,
          },
        ],
        ownedObjects: [],
        roleId: "app_readwrite",
        roleName: "app_readwrite",
      },
      {
        databaseId: "billing",
        databaseName: "billing",
        defaultPrivileges: [],
        grants: [
          {
            objectName: "billing",
            objectType: GrantObjectType.DATABASE,
            privilege: "SELECT on invoices, payments",
            schemaName: "",
            withGrantOption: false,
          },
        ],
        ownedObjects: [],
        roleId: "analytics_reader",
        roleName: "analytics_reader",
      },
      {
        databaseId: "billing",
        databaseName: "billing",
        defaultPrivileges: [],
        grants: [],
        ownedObjects: [
          {
            objectName: "billing",
            objectType: GrantObjectType.DATABASE,
            schemaName: "",
          },
        ],
        roleId: "app_owner",
        roleName: "app_owner",
      },
      {
        databaseId: "auth",
        databaseName: "auth",
        defaultPrivileges: [],
        grants: [],
        ownedObjects: [
          {
            objectName: "auth",
            objectType: GrantObjectType.DATABASE,
            schemaName: "",
          },
        ],
        roleId: "app_owner",
        roleName: "app_owner",
      },
      {
        databaseId: "functions",
        databaseName: "functions",
        defaultPrivileges: [],
        grants: [
          {
            objectName: "",
            objectType: GrantObjectType.SCHEMA,
            privilege: "ALL — superuser",
            schemaName: "public",
            withGrantOption: false,
          },
        ],
        ownedObjects: [],
        roleId: "cloud_admin",
        roleName: "cloud_admin",
      },
    ],
    truncatedRequestCount: 0,
  };
}

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
        pathname: "/instances/prod/roles",
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

rs.mock("@/hooks/api/role", () => ({
  publicGrantsForDatabaseQueryInput: () => ({}),
  roleDefaultPrivilegesForDatabaseQueryInput: () => ({}),
  roleGrantsForDatabaseQueryInput: () => ({}),
  roleOwnedObjectsForDatabaseQueryInput: () => ({}),
  rolesForInstanceQueryInput: (instanceId: string) => ({
    orderBy: "name asc",
    pageSize: 1000,
    parent: `instances/${instanceId}`,
  }),
  useListAllRolesQuery: () => ({
    data: {
      roles:
        roleApiState.roles.length > 0
          ? roleApiState.roles
          : [
              roleFixture({
                attributes: {
                  bypassesRls: false,
                  canCreateDatabase: true,
                  canCreateRole: false,
                  canLogin: true,
                  canReplicate: false,
                  connectionLimit: -1,
                  inheritsByDefault: true,
                  isSuperuser: true,
                },
                memberOf: [{ roleName: "pg_read_all_data" }],
                name: "instances/prod/roles/cG9zdGdyZXM",
                roleName: "postgres",
              }),
              roleFixture(),
            ],
    },
    error: null,
    isPending: false,
    refetch: rs.fn(async () => undefined),
  }),
  useListPublicGrantsQuery: () => ({
    data: {
      grants: roleApiState.publicGrants,
      nextPageToken: roleApiState.publicGrantsNextPageToken,
    },
    error: null,
    isPending: false,
  }),
  useListRoleDefaultPrivilegesQuery: () => ({
    data: {
      defaultPrivileges: roleApiState.defaultPrivileges,
      nextPageToken: roleApiState.defaultPrivilegesNextPageToken,
    },
    error: null,
    isPending: false,
  }),
  useListRoleGrantsQuery: () => ({
    data: {
      grants: roleApiState.grants,
      nextPageToken: roleApiState.grantsNextPageToken,
    },
    error: null,
    isPending: false,
  }),
  useListRoleOwnedObjectsQuery: () => ({
    data: {
      nextPageToken: roleApiState.ownedObjectsNextPageToken,
      ownedObjects: roleApiState.ownedObjects,
    },
    error: null,
    isPending: false,
  }),
  useRolesAccessMapResourcesQuery: () => ({
    data: roleApiState.accessMapResources ?? {
      budgetSkippedRequestCount: 0,
      failedRequestCount: 0,
      publicAccess: [],
      roleAccess: [],
      truncatedRequestCount: 0,
    },
    error: null,
    isPending: roleApiState.accessMapPending,
  }),
}));

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

async function renderConsoleSurface(children: ReactNode) {
  await render(
    <ScreenshotFrame>
      <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
        {children}
      </div>
    </ScreenshotFrame>
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
  await renderConsoleSurface(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
    />
  );

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
  setRolesAccessMapDesignFixture();
  await renderConsoleSurface(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
      tab="map"
    />
  );

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
  setRolesAccessMapDesignFixture(5);
  await renderConsoleSurface(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
      tab="map"
    />
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
  setRolesAccessMapDesignFixture();
  if (!roleApiState.accessMapResources) {
    throw new Error("Expected the access map fixture.");
  }
  roleApiState.accessMapResources.truncatedRequestCount = 2;

  await renderConsoleSurface(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
      tab="map"
    />
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
  setRolesAccessMapDesignFixture();
  if (!roleApiState.accessMapResources) {
    throw new Error("Expected the access map fixture.");
  }
  roleApiState.accessMapResources.failedRequestCount = 1;

  await renderConsoleSurface(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
      tab="map"
    />
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
  const previousResources = roleApiState.accessMapResources;
  roleApiState.accessMapPending = true;
  roleApiState.accessMapResources = {
    budgetSkippedRequestCount: 0,
    failedRequestCount: 0,
    publicAccess: [],
    roleAccess: [],
    truncatedRequestCount: 0,
  };
  try {
    await renderConsoleSurface(
      <InstanceRolesPage
        instanceId="prod"
        searchRoute="/instances/$instanceId/roles/"
        tab="map"
      />
    );

    await expect
      .element(page.getByText("Loading role object access."))
      .toBeVisible();
    await expect
      .element(page.getByText("No object grants found for the visible roles."))
      .not.toBeAttached();
  } finally {
    roleApiState.accessMapPending = false;
    roleApiState.accessMapResources = previousResources;
  }
});

test("console roles login no state keeps the same indicator slot", async () => {
  roleApiState.roles = [
    roleFixture({
      attributes: {
        bypassesRls: false,
        canCreateDatabase: false,
        canCreateRole: false,
        canLogin: false,
        canReplicate: false,
        connectionLimit: -1,
        inheritsByDefault: true,
        isSuperuser: false,
      },
      name: "instances/prod/roles/app_group",
      roleName: "app_group",
    }),
  ];

  await renderConsoleSurface(
    <InstanceRolesPage
      instanceId="prod"
      searchRoute="/instances/$instanceId/roles/"
    />
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
  setRoleDetailFixture();

  await renderConsoleSurface(
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema={undefined}
      grantsType={undefined}
      instanceId="prod"
      roleId="app_user"
      tab="overview"
    />
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect.element(page.getByText("Role attributes")).toBeVisible();
  await expect.element(page.getByText("Access", { exact: true })).toBeVisible();
});

test("console role detail grants overview keeps access sources scannable", async () => {
  setRoleDetailFixture();

  await renderConsoleSurface(
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema={undefined}
      grantsType={undefined}
      instanceId="prod"
      roleId="app_user"
      tab="grants"
    />
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Direct grants", { exact: true }).first())
    .toBeVisible();
});

test("console role schema grants capture active shared filters", async () => {
  setRoleDetailFixture();
  roleApiState.grants.push({
    grantor: "postgres",
    objectName: "recent_orders",
    objectType: GrantObjectType.VIEW,
    privilege: "SELECT",
    schemaName: "public",
    withGrantOption: false,
  });

  await renderConsoleSurface(
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema="public"
      grantsType="tables"
      instanceId="prod"
      roleId="app_user"
      tab="grants"
    />
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
  setRoleDetailFixture();
  roleApiState.grantsNextPageToken = "more-grants";
  roleApiState.ownedObjectsNextPageToken = "more-owned-objects";
  roleApiState.publicGrantsNextPageToken = "more-public-grants";

  await renderConsoleSurface(
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema={undefined}
      grantsType={undefined}
      instanceId="prod"
      roleId="app_user"
      tab="access-map"
    />
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
  setRoleDetailFixture();

  await renderConsoleSurface(
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema={undefined}
      grantsType={undefined}
      instanceId="prod"
      roleId="app_user"
      tab="members"
    />
  );

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
  setRoleDetailFixture();

  await renderConsoleSurface(
    <RoleDetailPage
      grantsReach={undefined}
      grantsSchema={undefined}
      grantsType={undefined}
      instanceId="prod"
      roleId="app_user"
      tab="definition"
    />
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "app_user" }))
    .toBeVisible();
  await expect.element(page.getByText("SQL definition")).toBeVisible();
});
