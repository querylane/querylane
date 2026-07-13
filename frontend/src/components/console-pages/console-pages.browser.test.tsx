import { Code, ConnectError } from "@connectrpc/connect";
import { Database, ServerOff } from "lucide-react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { AppErrorView, AppInlineError } from "@/components/app-error-view";
import { ConfigManagedEmptyState } from "@/components/config-managed-empty-state";
import {
  MetadataCard,
  PageHeader,
  SummaryCard,
} from "@/components/console-pages/console-layout";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import { RoleDetailPage } from "@/components/console-pages/role-detail-page";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const ALL_ROLES_CHIP_NAME = /All/;
const SUPERUSERS_CHIP_NAME = /Superusers/;

const roleApiState = vi.hoisted(() => ({
  accessMapResources: null as null | {
    publicAccess: unknown[];
    roleAccess: unknown[];
  },
  defaultPrivileges: [] as unknown[],
  grants: [] as unknown[],
  ownedObjects: [] as unknown[],
  publicGrants: [] as unknown[],
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

function setRolesAccessMapDesignFixture() {
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
  };
}

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const linkExportName = "Link";
  return {
    ...actual,
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

vi.mock("@/hooks/api/role", () => ({
  publicGrantsForDatabaseQueryInput: () => ({}),
  roleDefaultPrivilegesForDatabaseQueryInput: () => ({}),
  roleGrantsForDatabaseQueryInput: () => ({}),
  roleOwnedObjectsForDatabaseQueryInput: () => ({}),
  rolesForInstanceQueryInput: (instanceId: string) => ({
    orderBy: "name asc",
    pageSize: 1000,
    parent: `instances/${instanceId}`,
  }),
  useListAllPublicGrantsQuery: () => ({
    data: { grants: roleApiState.publicGrants },
    error: null,
    isPending: false,
  }),
  useListAllRoleDefaultPrivilegesQuery: () => ({
    data: { defaultPrivileges: roleApiState.defaultPrivileges },
    error: null,
    isPending: false,
  }),
  useListAllRoleGrantsQuery: () => ({
    data: { grants: roleApiState.grants },
    error: null,
    isPending: false,
  }),
  useListAllRoleOwnedObjectsQuery: () => ({
    data: { ownedObjects: roleApiState.ownedObjects },
    error: null,
    isPending: false,
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
    refetch: vi.fn(async () => undefined),
  }),
  useRolesAccessMapResourcesQuery: () => ({
    data: roleApiState.accessMapResources ?? {
      publicAccess: [],
      roleAccess: [],
    },
    error: null,
    isPending: false,
  }),
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: [
      { id: "appdb", name: "appdb" },
      { id: "analytics", name: "analytics" },
    ],
    selectedDatabase: { id: "appdb", name: "appdb" },
  }),
}));

function createPostgresSqlstateError({
  code,
  conditionName,
  operation,
  reason,
  sqlstate,
  sqlstateClass,
}: {
  code: Code;
  conditionName: string;
  operation: string;
  reason: string;
  sqlstate: string;
  sqlstateClass: string;
}) {
  const error = new ConnectError(
    `PostgreSQL ${conditionName} during ${operation}`,
    code
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          condition_name: conditionName,
          operation,
          sqlstate,
          sqlstate_class: sqlstateClass,
        },
        reason,
      },
      type: "google.rpc.ErrorInfo",
      value: new Uint8Array([1]),
    },
  ];
  return error;
}

function renderConsoleSurface(children: ReactNode) {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] rounded-2xl border border-border bg-background p-8 text-foreground">
        {children}
      </div>
    </ScreenshotFrame>
  );
}

test("console resource overview keeps dense metadata readable", async () => {
  renderConsoleSurface(
    <div className="space-y-6">
      <PageHeader
        description="Backend-reported metadata for a production PostgreSQL instance. Long resource identifiers should stay contained without breaking the layout."
        eyebrow="Instance"
        title="Production Analytics Writer"
      />
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Databases" value="24" />
        <SummaryCard label="Schemas" value="186" />
        <SummaryCard label="Tables" value="4,812" />
        <SummaryCard label="Connections" value="74 / 250" />
      </div>
      <MetadataCard
        items={[
          { label: "Host", value: "analytics-writer.internal.querylane.test" },
          { label: "Owner", value: "data-platform" },
          { label: "SSL mode", value: "verify-full" },
        ]}
        title="Metadata"
      />
    </div>
  );

  await expect
    .element(page.getByRole("heading", { name: "Production Analytics Writer" }))
    .toBeVisible();
  await expect
    .element(page.getByText("analytics-writer.internal.querylane.test"))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-resource-overview"
  );
});

test("console roles list shows kind chips, sortable columns, and role rows", async () => {
  renderConsoleSurface(<InstanceRolesPage instanceId="prod" />);

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Roles" }))
    .toBeVisible();
  await expect.element(page.getByRole("tab", { name: "Table" })).toBeVisible();
  await expect
    .element(page.getByRole("tab", { name: "Access map" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ALL_ROLES_CHIP_NAME }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: SUPERUSERS_CHIP_NAME }))
    .toBeVisible();
  await expect
    .element(page.getByText("postgres", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("app_user", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByPlaceholder("Search roles…")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-roles-table"
  );
});

test("console roles access map matches the design source", async () => {
  setRolesAccessMapDesignFixture();
  renderConsoleSurface(<InstanceRolesPage instanceId="prod" tab="map" />);

  await expect
    .element(page.getByText("cloud_admin", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("app_readwrite", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("PUBLIC", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("logistics", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("shipping", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "View" }).click();
  await expect.element(page.getByText("Access filters")).toBeVisible();
  await expect.element(page.getByText("Default privileges")).toBeVisible();
  await page.getByRole("button", { name: "View" }).click();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-roles-access-map"
  );

  await page
    .getByRole("button", { name: "Trace access for cloud_admin" })
    .click();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-roles-access-map-selected-node"
  );
});

test("console roles access filters contain their switches on narrow viewports", async () => {
  await page.viewport(355, 812);
  try {
    setRolesAccessMapDesignFixture();
    renderConsoleSurface(<InstanceRolesPage instanceId="prod" tab="map" />);

    await page.getByRole("button", { name: "View" }).click();
    await expect.element(page.getByText("Access filters")).toBeVisible();

    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    );
    if (!popover) {
      throw new Error("Expected the access filters popover.");
    }
    const popoverBox = popover.getBoundingClientRect();
    const switches = popover.querySelectorAll<HTMLElement>(
      '[data-slot="switch"]'
    );
    expect(switches.length).toBeGreaterThan(0);
    for (const filterSwitch of switches) {
      expect(filterSwitch.getBoundingClientRect().right).toBeLessThanOrEqual(
        popoverBox.right
      );
    }
  } finally {
    await page.viewport(1280, 1000);
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

  renderConsoleSurface(<InstanceRolesPage instanceId="prod" />);

  await expect.element(page.getByText("No", { exact: true })).toBeVisible();
  const noLabel = page.getByText("No", { exact: true }).element();
  expect(noLabel.previousElementSibling).not.toBeNull();
});

test("console SQLSTATE error surfaces keep common PostgreSQL failures scannable", async () => {
  const scenarios = [
    {
      endpoint: "DatabaseCatalog",
      error: createPostgresSqlstateError({
        code: Code.Unauthenticated,
        conditionName: "invalid_password",
        operation: "list_views",
        reason: "UNAUTHENTICATED",
        sqlstate: "28P01",
        sqlstateClass: "28",
      }),
      label: "Catalog authentication",
      slug: "authentication",
      sqlstate: "28P01",
    },
    {
      endpoint: "ReadRows",
      error: createPostgresSqlstateError({
        code: Code.PermissionDenied,
        conditionName: "insufficient_privilege",
        operation: "read_rows",
        reason: "PERMISSION_DENIED",
        sqlstate: "42501",
        sqlstateClass: "42",
      }),
      label: "Query permissions",
      slug: "permission",
      sqlstate: "42501",
    },
    {
      endpoint: "ListTableIndexes",
      error: createPostgresSqlstateError({
        code: Code.Unavailable,
        conditionName: "cannot_connect_now",
        operation: "list_indexes",
        reason: "UNAVAILABLE",
        sqlstate: "57P03",
        sqlstateClass: "57",
      }),
      label: "Server availability",
      slug: "availability",
      sqlstate: "57P03",
    },
  ];

  renderConsoleSurface(
    <div className="space-y-5">
      <PageHeader
        description="PostgreSQL SQLSTATE diagnostics should stay visible when catalog, query, and metadata requests fail."
        eyebrow="Error states"
        title="SQLSTATE diagnostics"
      />
      <div className="grid gap-4">
        {scenarios.map((scenario) => (
          <section
            className="space-y-2"
            data-testid={`sqlstate-scenario-${scenario.slug}`}
            key={scenario.label}
          >
            <h2 className="font-semibold text-base">{scenario.label}</h2>
            <AppInlineError
              error={normalizeAppUiError(scenario.error, {
                area: "console.sqlstate.visual",
                endpoint: scenario.endpoint,
                source: "query",
                surface: "inline",
              })}
              onRetry={async () => undefined}
              retryLabel="Retry"
            />
          </section>
        ))}
      </div>
    </div>
  );

  await expect
    .element(page.getByRole("heading", { name: "SQLSTATE diagnostics" }))
    .toBeVisible();

  for (const scenario of scenarios) {
    const section = page.getByTestId(`sqlstate-scenario-${scenario.slug}`);
    await expect(section).toMatchScreenshot(
      `console-sqlstate-${scenario.slug}`
    );

    await section.getByRole("button", { name: "Error details" }).click();
    await expect
      .element(
        page.getByText(`SQLSTATE: ${scenario.sqlstate}`, { exact: true })
      )
      .toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect
      .element(page.getByText(`SQLSTATE: ${scenario.sqlstate}`))
      .not.toBeInTheDocument();
  }
});

test("console empty states distinguish config-managed and user-actionable gaps", async () => {
  renderConsoleSurface(
    <div className="grid gap-6 md:grid-cols-2">
      <ConfigManagedEmptyState />
      <EmptyState
        action={
          <Button size="sm" type="button">
            Create database
          </Button>
        }
        description="No databases have been discovered for this instance yet. Refresh metadata or create the first database."
        icon={Database}
        title="No databases found"
      />
    </div>
  );

  await expect.element(page.getByText("No instances configured")).toBeVisible();
  await expect.element(page.getByText("No databases found")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-empty-states"
  );
});

test("console page error keeps recovery actions and diagnostics scannable", async () => {
  const error = normalizeAppUiError(
    new Error("connection refused while loading instance metadata"),
    {
      area: "console.instance",
      request: {
        host: "api.querylane.local",
        plaintext: false,
        requestJson: null,
        requestJsonNote: null,
        requestMethod: "POST",
        rpcPath: "/querylane.console.v1alpha1.InstanceService/GetInstance",
        url: "https://api.querylane.local/querylane.console.v1alpha1.InstanceService/GetInstance",
      },
      source: "query",
      surface: "route",
    }
  );

  renderConsoleSurface(
    <AppErrorView
      actions={
        <Button size="sm" type="button" variant="outline">
          <ServerOff className="size-4" />
          Check backend
        </Button>
      }
      error={error}
      onRetry={async () => undefined}
      retryLabel="Retry metadata"
      variant="page"
    />
  );

  await expect.element(page.getByText("Request failed")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Retry metadata" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Error details" }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-page-error"
  );

  await page.getByRole("button", { name: "Error details" }).click();
  await expect.element(page.getByText("Technical details")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy as cURL" }))
    .toBeVisible();
});

test("console role detail overview shows access sources and attributes", async () => {
  setRoleDetailFixture();

  renderConsoleSurface(
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
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-role-detail-overview"
  );
});

test("console role detail grants overview keeps access sources scannable", async () => {
  setRoleDetailFixture();

  renderConsoleSurface(
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
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-role-detail-grants-overview"
  );
});

test("console role detail membership shows inherited and child roles", async () => {
  setRoleDetailFixture();

  renderConsoleSurface(
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
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-role-detail-membership"
  );
});

test("console role detail definition shows reconstructed SQL", async () => {
  setRoleDetailFixture();

  renderConsoleSurface(
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
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "console-role-detail-definition"
  );
});
