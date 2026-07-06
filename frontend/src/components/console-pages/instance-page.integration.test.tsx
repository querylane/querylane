import { create as createProto } from "@bufbuild/protobuf";
import { anyPack, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BackendInstancePage } from "@/components/console-pages/instance-page";
import type { refreshAllInstancesCache as refreshAllInstancesCacheFn } from "@/hooks/api/instance";
import type {
  PostgresDatabase,
  PostgresInstance,
} from "@/lib/db-resource-mappers";
import {
  BadRequestSchema,
  ErrorInfoSchema,
} from "@/protogen/google/rpc/error_details_pb";
import { StatusSchema } from "@/protogen/google/rpc/status_pb";
import {
  ExtensionSchema,
  type ListExtensionsResponse,
  ListExtensionsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";
import {
  AutovacuumHealthSchema,
  type CheckInstanceHealthResponse,
  CheckInstanceHealthResponseSchema,
  ConnectionActivityHealthSchema,
  type GetInstanceOverviewResponse,
  type GetInstanceResponse,
  GetInstanceResponseSchema,
  HealthCheckStatus,
  InstanceHealthSchema,
  InstanceSchema,
  PgStatStatementsHealthSchema,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  PostgresConfigSchema,
  ReplicationHealthSchema,
  ServerInfo_ReplicationRole,
  ServerInfoSchema,
  StatsAccessHealthSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

type RefreshAllInstancesCacheInput = Parameters<
  typeof refreshAllInstancesCacheFn
>[0];

interface InstanceUpdateInput {
  instance: {
    config: {
      database: string;
      host: string;
      password: string;
      port: number;
      sslMode: number;
      sslNegotiation: number;
      username: string;
    };
    displayName: string;
    labels: Record<string, string>;
    name: string;
  };
  updateMask: { paths: string[] };
}

const ENCODING_COLUMN_NAME = /encoding/i;
const UPTIME_FACT_PATTERN = /^up /;
const AUTOVACUUM_ROW_NAME = /Autovacuum/;
const CHARSET_COLUMN_NAME = /^charset/i;
const COLLATION_COLUMN_NAME = /^collation/i;

const state = vi.hoisted(() => ({
  databases: [] as PostgresDatabase[],
  extensionData: undefined as ListExtensionsResponse | undefined,
  extensionInput: undefined as
    | { filter?: string; orderBy?: string; pageSize?: number; parent: string }
    | undefined,
  healthData: undefined as CheckInstanceHealthResponse | undefined,
  instanceData: undefined as GetInstanceResponse | undefined,
  instances: [] as PostgresInstance[],
  navigate: vi.fn(async () => undefined),
  overviewData: undefined as GetInstanceOverviewResponse | undefined,
  queryClient: { tag: "query-client" },
  refetchExtensions: vi.fn(async () => ({})),
  refetchInstance: vi.fn(async () => ({})),
  refreshAllInstancesCache: vi.fn(
    async (_input: RefreshAllInstancesCacheInput) => undefined
  ),
  retryInstanceCatalog: vi.fn(async () => undefined),
  selectedInstanceStatus: "disconnected" as
    | "connected"
    | "disconnected"
    | "error",
  transport: { tag: "transport" },
  updateInstance: vi.fn(async (_input: InstanceUpdateInput) => undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  ...Object.fromEntries([
    [
      "Link",
      ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
    ],
  ]),
  useLocation: ({
    select,
  }: {
    select: (location: {
      hash: string;
      pathname: string;
      searchStr: string;
    }) => unknown;
  }) => select({ hash: "", pathname: "/", searchStr: "" }),
  useNavigate: () => state.navigate,
  useSearch: ({
    select,
  }: {
    select: (search: Record<string, unknown>) => unknown;
  }) => select({}),
}));

vi.mock("@connectrpc/connect-query", () => ({
  useTransport: () => state.transport,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query"
  );
  return {
    ...actual,
    useQueryClient: () => state.queryClient,
  };
});

vi.mock("@/hooks/api/console", () => ({
  useIsConfigManagedInstances: () => false,
}));

vi.mock("@/hooks/api/database", () => ({
  selectedDatabaseQueryOptions: () => ({
    queryKey: ["integration", "selected-database"],
  }),
}));

vi.mock("@/hooks/api/extension", () => ({
  extensionsForDatabaseQueryInput: (input: {
    databaseId: string;
    instanceId: string;
  }) => ({
    orderBy: "installed desc",
    pageSize: 50,
    parent: `instances/${input.instanceId}/databases/${input.databaseId}`,
  }),
  useListAllExtensionsQuery: (input: {
    filter?: string;
    orderBy?: string;
    pageSize?: number;
    parent: string;
  }) => {
    state.extensionInput = input;
    return {
      data: state.extensionData,
      error: null,
      isPending: false,
      refetch: state.refetchExtensions,
    };
  },
}));

vi.mock("@/hooks/api/metrics", () => ({
  quantizedMetricsAnchor: () => 0,
  useInstanceMetricsQuery: () => ({
    data: undefined,
    error: null,
    isFetching: false,
    isPending: true,
    refetch: vi.fn(async () => ({})),
  }),
  useInstancePreviousMetricsQuery: () => ({
    data: undefined,
    error: null,
    isFetching: false,
    isPending: true,
    refetch: vi.fn(async () => ({})),
  }),
}));

vi.mock("@/hooks/api/instance", () => ({
  refreshAllInstancesCache: (input: RefreshAllInstancesCacheInput) =>
    state.refreshAllInstancesCache(input),
  useCheckInstanceHealthQuery: () => ({
    data: state.healthData,
    error: null,
    isFetching: false,
    isPending: state.healthData === undefined,
    refetch: vi.fn(async () => ({})),
  }),
  useDeleteInstanceMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(async () => undefined),
  }),
  useGetInstanceOverviewQuery: () => ({
    data: state.overviewData,
    error: null,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(async () => ({})),
  }),
  useGetInstanceQuery: () => ({
    data: state.instanceData,
    dataUpdatedAt: 0,
    error: null,
    isFetching: false,
    isPending: false,
    refetch: state.refetchInstance,
  }),
  useUpdateInstanceMutation: () => ({
    isPending: false,
    mutateAsync: state.updateInstance,
  }),
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: state.databases,
    instances: state.instances,
    navigateToDatabase: vi.fn(),
    queryStates: {
      databases: {
        error: null,
        hasData: true,
        hasResolved: true,
        isFetching: false,
        isPending: false,
        isSuppressed: false,
        status: "success",
        suppressedReason: null,
      },
      instances: {
        error: null,
        hasData: true,
        hasResolved: true,
        isFetching: false,
        isPending: false,
        isSuppressed: false,
        status: "success",
        suppressedReason: null,
      },
    },
    retryInstanceCatalog: state.retryInstanceCatalog,
    selectedInstance: postgresInstanceFixture(state.selectedInstanceStatus),
  }),
}));

function postgresInstanceFixture(
  status: PostgresInstance["status"] = "disconnected"
): PostgresInstance {
  return {
    connectionError: "",
    host: "db.internal",
    id: "prod",
    name: "Production",
    port: 5432,
    resourceName: "instances/prod",
    status,
  };
}

function instanceResponse({
  connectionError = "",
}: {
  connectionError?: string;
} = {}) {
  return createProto(GetInstanceResponseSchema, {
    instance: createProto(InstanceSchema, {
      config: createProto(PostgresConfigSchema, {
        database: "postgres",
        host: "db.internal",
        password: "",
        port: 5432,
        sslMode: PostgresConfig_SslMode.PREFER,
        username: "postgres",
      }),
      connectionError,
      displayName: "Production",
      labels: {},
      name: "instances/prod",
    }),
  });
}

function connectedInstanceResponse({
  sslMode = PostgresConfig_SslMode.PREFER,
}: {
  sslMode?: PostgresConfig_SslMode;
} = {}) {
  return createProto(GetInstanceResponseSchema, {
    instance: createProto(InstanceSchema, {
      config: createProto(PostgresConfigSchema, {
        database: "postgres",
        host: "db.internal",
        password: "",
        port: 5432,
        sslMode,
        sslNegotiation: PostgresConfig_SslNegotiation.POSTGRES,
        username: "postgres",
      }),
      displayName: "Production",
      labels: {},
      name: "instances/prod",
    }),
    serverInfo: createProto(ServerInfoSchema, {
      maxConnections: 100,
      replicationRole: ServerInfo_ReplicationRole.PRIMARY,
      startedAt: timestampFromDate(new Date(Date.now() - 90 * 60 * 1000)),
      version:
        "PostgreSQL 17.9 on aarch64-unknown-linux-musl, compiled by gcc, 64-bit",
      versionShort: "17.9",
    }),
  });
}

function extensionInventoryResponse() {
  return createProto(ListExtensionsResponseSchema, {
    extensions: [
      createProto(ExtensionSchema, {
        displayName: "pg_stat_statements",
        installed: true,
        installedVersion: "1.10",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        displayName: "pgcrypto",
        installed: true,
        installedVersion: "1.3",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        displayName: "postgis",
        installed: false,
      }),
    ],
  });
}

function instanceHealthResponse({
  includeAutovacuum = true,
}: {
  includeAutovacuum?: boolean;
} = {}) {
  return createProto(CheckInstanceHealthResponseSchema, {
    health: createProto(InstanceHealthSchema, {
      ...(includeAutovacuum
        ? {
            autovacuum: createProto(AutovacuumHealthSchema, {
              maxWorkers: 3,
              runningWorkers: 1,
              status: HealthCheckStatus.OK,
              summary: "1 of 3 workers · last ran 18m ago",
            }),
          }
        : {}),
      connectionActivity: createProto(ConnectionActivityHealthSchema, {
        activeConnections: 3,
        idleConnections: 39,
        maxConnections: 100,
        status: HealthCheckStatus.OK,
        totalConnections: 42,
        utilizationRatio: 0.42,
        waitingForLockConnections: 0,
      }),
      pgStatStatements: createProto(PgStatStatementsHealthSchema, {
        extensionInstalled: true,
        sharedPreloadConfigured: false,
        status: HealthCheckStatus.WARNING,
        summary: "Not loaded (needs shared_preload_libraries)",
      }),
      replication: createProto(ReplicationHealthSchema, {
        role: ServerInfo_ReplicationRole.PRIMARY,
        status: HealthCheckStatus.OK,
        streamingReplicas: 1,
        summary: "Primary · 1 replica streaming",
      }),
      statsAccess: createProto(StatsAccessHealthSchema, {
        currentUser: "postgres",
        status: HealthCheckStatus.OK,
        summary: "superuser · full visibility",
        superuser: true,
      }),
    }),
  });
}

beforeEach(() => {
  state.databases = [];
  state.extensionData = undefined;
  state.extensionInput = undefined;
  state.healthData = undefined;
  state.instanceData = instanceResponse();
  state.instances = [postgresInstanceFixture()];
  state.navigate.mockClear();
  state.overviewData = undefined;
  state.refetchExtensions.mockReset();
  state.refetchExtensions.mockResolvedValue({});
  state.refetchInstance.mockReset();
  state.refetchInstance.mockImplementation(() => {
    state.instanceData = instanceResponse();
    return Promise.resolve({});
  });
  state.refreshAllInstancesCache.mockReset();
  state.refreshAllInstancesCache.mockResolvedValue(undefined);
  state.retryInstanceCatalog.mockReset();
  state.retryInstanceCatalog.mockResolvedValue(undefined);
  state.selectedInstanceStatus = "disconnected";
  state.updateInstance.mockReset();
  state.updateInstance.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

function renderInstanceConfiguration() {
  return render(
    <BackendInstancePage instanceId="prod" section="configuration" />
  );
}

function renderInstanceOverview() {
  return render(<BackendInstancePage instanceId="prod" section="overview" />);
}

function setFieldValue(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("backend instance configuration save", () => {
  test("refreshes the all-instances cache after a successful update", async () => {
    const user = userEvent.setup();
    renderInstanceConfiguration();

    setFieldValue("Display name", "Production Writer");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(state.updateInstance).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(state.refreshAllInstancesCache).toHaveBeenCalledWith({
        queryClient: state.queryClient,
        transport: state.transport,
      });
    });
  });

  test("trims text fields before building the update payload", async () => {
    const user = userEvent.setup();
    renderInstanceConfiguration();

    setFieldValue("Display name", "  Production Writer  ");
    setFieldValue("Host", " writer.internal ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(state.updateInstance).toHaveBeenCalledTimes(1);
    });
    const input = state.updateInstance.mock.calls[0]?.[0];
    expect(input?.instance.displayName).toBe("Production Writer");
    expect(input?.instance.config.host).toBe("writer.internal");
    expect(input?.updateMask.paths).toEqual(["display_name", "config.host"]);
  });

  test("maps server field violations from connection validation onto fields", async () => {
    const user = userEvent.setup();
    const passwordViolation =
      "PostgreSQL rejected these credentials. Check the username and password.";
    state.updateInstance.mockRejectedValue(
      new ConnectError(
        "authentication failed",
        Code.Unauthenticated,
        undefined,
        [
          {
            desc: BadRequestSchema,
            value: createProto(BadRequestSchema, {
              fieldViolations: [
                {
                  description: passwordViolation,
                  field: "instance.config.password",
                },
              ],
            }),
          },
        ]
      )
    );
    renderInstanceConfiguration();

    setFieldValue("Password", "wrong-password");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText(passwordViolation)).toBeTruthy();
    });
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe(
      "true"
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Password"));
    });
    expect(screen.queryByText("authentication failed")).toBeNull();
  });

  test("does not send an update when changes are whitespace only", async () => {
    const user = userEvent.setup();
    renderInstanceConfiguration();

    setFieldValue("Display name", "Production ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(state.updateInstance).not.toHaveBeenCalled();
  });

  test("resets the form after a successful save so the password is not re-sent", async () => {
    const user = userEvent.setup();
    renderInstanceConfiguration();

    setFieldValue("Password", "hunter2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(state.updateInstance).toHaveBeenCalledTimes(1);
    });
    expect(state.updateInstance.mock.calls[0]?.[0]?.updateMask.paths).toContain(
      "config.password"
    );

    // After the save, the form must reset from the refetched instance: the
    // backend redacts the password, so the field returns to blank and the
    // form is no longer dirty.
    await waitFor(() => {
      expect(screen.getByLabelText("Password")).toHaveProperty("value", "");
    });

    setFieldValue("Display name", "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(state.updateInstance).toHaveBeenCalledTimes(2);
    });
    expect(state.updateInstance.mock.calls[1]?.[0]?.updateMask.paths).toEqual([
      "display_name",
    ]);
  });
});

describe("backend instance danger zone", () => {
  test("disables delete when this is the only registered instance", () => {
    renderInstanceConfiguration();

    const dangerZone = screen.getByTestId("instance-danger-zone");

    expect(
      within(dangerZone).getByRole("button", { name: "Delete instance" })
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByText(
        "Querylane needs at least one registered instance. Add another instance before deleting this one."
      )
    ).toBeTruthy();
  });

  test("shows empty-catalog copy when no instances are registered", () => {
    state.instances = [];
    renderInstanceConfiguration();

    expect(
      screen.getByText(
        "No registered instances were found. Refresh the instance list before deleting."
      )
    ).toBeTruthy();
  });
});

describe("backend instance refresh", () => {
  test("handles rejected refetch promises without throwing", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instanceData = connectedInstanceResponse();
    state.refetchExtensions.mockRejectedValueOnce(
      new Error("extensions offline")
    );
    state.refetchInstance.mockRejectedValueOnce(new Error("network offline"));
    renderInstanceOverview();

    await user.click(screen.getByRole("button", { name: "Refresh data" }));

    await waitFor(() => {
      expect(state.refetchInstance).toHaveBeenCalledTimes(1);
    });
    expect(state.refetchExtensions).toHaveBeenCalledTimes(1);
  });
});

describe("backend instance health checks", () => {
  function renderConnectedHealth() {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.extensionData = extensionInventoryResponse();
    state.healthData = instanceHealthResponse();
    renderInstanceOverview();
    return screen.getByRole("region", { name: "Health checks" });
  }

  test("shows server facts and live health rows when connected", () => {
    const health = renderConnectedHealth();

    // Facts header from serverInfo + the unfiltered extension inventory.
    expect(within(health).getByText("PostgreSQL 17.9")).toBeTruthy();
    expect(within(health).getByText(UPTIME_FACT_PATTERN)).toBeTruthy();
    expect(within(health).getByText("aarch64 / linux")).toBeTruthy();
    expect(within(health).getByText("2 extensions")).toBeTruthy();
    expect(within(health).getByText("max 100 connections")).toBeTruthy();
    expect(state.extensionInput).toEqual({
      orderBy: "installed desc",
      pageSize: 50,
      parent: "instances/prod/databases/postgres",
    });

    // One compact confirmation row folds TCP, TLS, and auth together.
    expect(within(health).getByText("Connection")).toBeTruthy();
    expect(
      within(health).getByText(
        "db.internal:5432 · TLS prefer · credentials accepted"
      )
    ).toBeTruthy();

    // Live rows from the CheckInstanceHealth RPC, including autovacuum.
    expect(within(health).getByText("Connections")).toBeTruthy();
    expect(
      within(health).getByText("42% used · 3 active · no lock waits")
    ).toBeTruthy();
    expect(within(health).getByText("Replication")).toBeTruthy();
    expect(
      within(health).getByText("Primary · 1 replica streaming")
    ).toBeTruthy();
    expect(within(health).getByText("Stats access")).toBeTruthy();
    expect(
      within(health).getByText("superuser · full visibility")
    ).toBeTruthy();
    expect(within(health).getByText("pg_stat_statements")).toBeTruthy();
    expect(
      within(health).getByText("Not loaded (needs shared_preload_libraries)")
    ).toBeTruthy();
    expect(within(health).getByText("Autovacuum")).toBeTruthy();
    expect(
      within(health).getByText("1 of 3 workers · last ran 18m ago")
    ).toBeTruthy();
  });

  test("expands a row to show its typed detail fields", async () => {
    const user = userEvent.setup();
    const health = renderConnectedHealth();

    await user.click(
      within(health).getByRole("button", { name: AUTOVACUUM_ROW_NAME })
    );

    expect(await within(health).findByText("Running workers")).toBeTruthy();
    expect(within(health).getByText("1 of 3")).toBeTruthy();
  });

  test("renders a category from partial_errors as unavailable with its reason", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    const healthData = instanceHealthResponse({ includeAutovacuum: false });
    healthData.partialErrors = [
      createProto(StatusSchema, {
        details: [
          anyPack(
            ErrorInfoSchema,
            createProto(ErrorInfoSchema, {
              metadata: { check: "autovacuum" },
              reason: "AUTOVACUUM_CHECK_FAILED",
            })
          ),
        ],
        message: "permission denied for pg_stat_activity",
      }),
    ];
    state.healthData = healthData;

    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });
    expect(within(health).getByText("Autovacuum")).toBeTruthy();
    expect(
      within(health).getByText("permission denied for pg_stat_activity")
    ).toBeTruthy();
  });

  test("keeps metadata diagnostics when the instance is disconnected", () => {
    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });

    expect(within(health).getByText("TCP")).toBeTruthy();
    expect(within(health).getByText("Authentication")).toBeTruthy();
    expect(within(health).getAllByText("Not checked yet")).toHaveLength(2);
    expect(within(health).getByText("TLS")).toBeTruthy();
    expect(
      within(health).getByText("prefer · may fall back to plaintext")
    ).toBeTruthy();
    // No live rows without a connection.
    expect(within(health).queryByText("Autovacuum")).toBeNull();
    expect(within(health).queryByText("Stats access")).toBeNull();
  });

  test("explains the failure when the connection errors", () => {
    state.selectedInstanceStatus = "error";
    state.instanceData = instanceResponse({
      connectionError: "connection refused",
    });

    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });

    expect(within(health).getByText("TCP")).toBeTruthy();
    expect(within(health).getByText("connection refused")).toBeTruthy();
    expect(within(health).getByText("No authenticated session")).toBeTruthy();
  });
});

describe("backend instance database list", () => {
  test("searches and facets databases from the filter rail", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.databases = [
      {
        characterSet: "UTF8",
        collation: "en_US.UTF-8",
        id: "customer-events",
        isSystemDatabase: false,
        name: "customer_events",
        owner: "data-platform",
        resourceName: "instances/prod/databases/customer-events",
      },
      {
        characterSet: "LATIN1",
        collation: "C",
        id: "analytics-archive",
        isSystemDatabase: false,
        name: "analytics_archive",
        owner: "data-platform",
        resourceName: "instances/prod/databases/analytics-archive",
      },
      {
        characterSet: "UTF8",
        collation: "C",
        id: "postgres",
        isSystemDatabase: true,
        name: "postgres",
        owner: "postgres",
        resourceName: "instances/prod/databases/postgres",
      },
    ];

    renderInstanceOverview();

    const search = screen.getByRole("textbox", {
      name: "Search databases...",
    });
    expect(search).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kind" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Encoding" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Owner" })).toBeTruthy();
    const filterRail = search.parentElement?.parentElement;
    if (!filterRail) {
      throw new Error("Missing database filter rail");
    }
    expect(
      within(filterRail)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Owner", "Encoding", "Kind"]);

    await user.type(search, "customer");

    expect(await screen.findByText("customer_events")).toBeTruthy();
    expect(screen.queryByText("analytics_archive")).toBeNull();
    expect(screen.queryByText("postgres")).toBeNull();

    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Kind" }));
    await user.click(screen.getByRole("option", { name: "System" }));

    expect(
      await screen.findByRole("button", {
        name: "postgres postgres UTF8 C System",
      })
    ).toBeTruthy();
    expect(screen.queryByText("customer_events")).toBeNull();
    expect(screen.queryByText("analytics_archive")).toBeNull();
  });

  test("groups charset and collation into one encoding column", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.databases = [
      {
        characterSet: "UTF8",
        collation: "en_US.UTF-8",
        id: "customer-events",
        isSystemDatabase: false,
        name: "customer_events",
        owner: "data-platform",
        resourceName: "instances/prod/databases/customer-events",
      },
      {
        characterSet: "UTF8",
        collation: "C",
        id: "postgres",
        isSystemDatabase: true,
        name: "postgres",
        owner: "postgres",
        resourceName: "instances/prod/databases/postgres",
      },
    ];

    renderInstanceOverview();

    expect(
      screen.getByRole("columnheader", { name: ENCODING_COLUMN_NAME })
    ).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: CHARSET_COLUMN_NAME })
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: COLLATION_COLUMN_NAME })
    ).toBeNull();
    expect(screen.getAllByText("UTF8")).toHaveLength(2);
    expect(screen.getByText("en_US.UTF-8")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
  });
});
