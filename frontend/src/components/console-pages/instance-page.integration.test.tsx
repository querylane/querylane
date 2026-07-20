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
  ApplicationConnectionsSchema,
  AutovacuumHealthSchema,
  type CheckInstanceHealthResponse,
  CheckInstanceHealthResponseSchema,
  ConnectionActivityHealthSchema,
  ConnectionActivitySessionSchema,
  type GetInstanceOverviewResponse,
  type GetInstanceResponse,
  GetInstanceResponseSchema,
  HealthCheckStatus,
  Instance_CredentialState,
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
const BLOCKED_ACTIVITY_TABLE_ROW_NAME = /4302/;
const LOCK_WAIT_HINT_PATTERN = /held by another session/;
const ACTIVITY_SNAPSHOT_HINT_PATTERN = /refresh to take a new snapshot/;
const BLOCKER_ACTIVITY_TABLE_ROW_NAME = /4211/;
const MISSING_INSTANCE_SECRET_KEY_MESSAGE =
  /QUERYLANE_INSTANCE_SECRET_KEY is not configured/;
const REPLICATION_ROW_NAME = /Replication/;
const REPLICATION_WARNING_ROW_NAME = /Warning: Replication/;

const state = vi.hoisted(() => ({
  activityQueryOptions: undefined as Record<string, unknown> | undefined,
  databases: [] as PostgresDatabase[],
  deleteInstance: vi.fn(async () => undefined),
  extensionData: undefined as ListExtensionsResponse | undefined,
  extensionInput: undefined as
    | { filter?: string; orderBy?: string; pageSize?: number; parent: string }
    | undefined,
  healthData: undefined as CheckInstanceHealthResponse | undefined,
  healthQueryOptions: undefined as Record<string, unknown> | undefined,
  instanceCatalogError: null as unknown,
  instanceCatalogHasData: true,
  instanceCatalogHasResolved: true,
  instanceCatalogIsPending: false,
  instanceData: undefined as GetInstanceResponse | undefined,
  instances: [] as PostgresInstance[],
  navigate: vi.fn(async () => undefined),
  navigateToDatabase: vi.fn(),
  overviewData: undefined as GetInstanceOverviewResponse | undefined,
  queryClient: {
    getQueryState: vi.fn(() => undefined),
    prefetchQuery: vi.fn(async () => undefined),
    tag: "query-client",
  },
  refetchExtensions: vi.fn(async () => ({})),
  refetchInstance: vi.fn(async () => ({})),
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
  useCheckInstanceActivityQuery: (
    _input: unknown,
    options: Record<string, unknown>
  ) => {
    state.activityQueryOptions = options;
    return {
      data: state.healthData
        ? {
            activity: state.healthData.health?.connectionActivity,
            partialErrors: state.healthData.partialErrors,
          }
        : undefined,
      error: null,
      isFetching: false,
      isPending: state.healthData === undefined,
      refetch: vi.fn(async () => ({})),
    };
  },
  useCheckInstanceHealthQuery: (
    _input: unknown,
    options: Record<string, unknown>
  ) => {
    state.healthQueryOptions = options;
    return {
      data: state.healthData,
      error: null,
      isFetching: false,
      isPending: state.healthData === undefined,
      refetch: vi.fn(async () => ({})),
    };
  },
  useDeleteInstanceMutation: () => ({
    isPending: false,
    mutateAsync: state.deleteInstance,
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
    navigateToDatabase: state.navigateToDatabase,
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
        error: state.instanceCatalogError,
        hasData: state.instanceCatalogHasData,
        hasResolved: state.instanceCatalogHasResolved,
        isFetching: false,
        isPending: state.instanceCatalogIsPending,
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
    credentialsUnreadable: false,
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
  credentialError = "",
  credentialState = Instance_CredentialState.UNSPECIFIED,
}: {
  connectionError?: string;
  credentialError?: string;
  credentialState?: Instance_CredentialState;
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
      credentialError,
      credentialState,
      displayName: "Production",
      labels: {},
      name: "instances/prod",
    }),
  });
}

function connectedInstanceResponse({
  includeServerInfo = true,
  replicationRole = ServerInfo_ReplicationRole.PRIMARY,
  sslMode = PostgresConfig_SslMode.PREFER,
}: {
  includeServerInfo?: boolean;
  replicationRole?: ServerInfo_ReplicationRole;
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
    ...(includeServerInfo
      ? {
          serverInfo: createProto(ServerInfoSchema, {
            maxConnections: 100,
            replicationRole,
            startedAt: timestampFromDate(new Date(Date.now() - 90 * 60 * 1000)),
            version:
              "PostgreSQL 17.9 on aarch64-unknown-linux-musl, compiled by gcc, 64-bit",
            versionShort: "17.9",
          }),
        }
      : {}),
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
  replicationRole = ServerInfo_ReplicationRole.PRIMARY,
  walReceiverActive = false,
}: {
  includeAutovacuum?: boolean;
  replicationRole?: ServerInfo_ReplicationRole;
  walReceiverActive?: boolean;
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
        attachedReplicas: 1,
        maxReplicationLagBytes: 86_000_000n,
        replayLagSeconds: 0n,
        role: replicationRole,
        status: HealthCheckStatus.OK,
        streamingReplicas: 1,
        summary:
          replicationRole === ServerInfo_ReplicationRole.PRIMARY
            ? "Primary · 1 replica streaming"
            : "Replica · WAL receiver active",
        synchronousReplicas: 0,
        walReceiverActive,
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

function activityHealthResponse() {
  return createProto(CheckInstanceHealthResponseSchema, {
    health: createProto(InstanceHealthSchema, {
      connectionActivity: createProto(ConnectionActivityHealthSchema, {
        activeConnections: 3,
        byApplication: [
          createProto(ApplicationConnectionsSchema, {
            activeConnections: 2,
            applicationName: "api-gateway",
            idleConnections: 1,
            idleInTransactionConnections: 1,
            totalConnections: 4,
          }),
          createProto(ApplicationConnectionsSchema, {
            activeConnections: 1,
            applicationName: "metabase",
            totalConnections: 1,
          }),
        ],
        idleConnections: 39,
        idleInTransactionConnections: 1,
        longestTransactionSeconds: BigInt(252),
        longRunningTransactionConnections: 1,
        maxConnections: 100,
        sessions: [
          createProto(ConnectionActivitySessionSchema, {
            applicationName: "worker-pool",
            backendAgeSeconds: 7200n,
            clientAddress: "10.2.0.7",
            clientPort: 51_234,
            databaseName: "logistics",
            durationSeconds: BigInt(252),
            pid: 4211,
            query:
              "UPDATE shipping.shipments SET status = 'in_transit', updated_at = now() WHERE id = $1",
            queryAgeSeconds: 180n,
            state: "idle in transaction",
            transactionAgeSeconds: 252n,
            username: "app_readwrite",
          }),
          createProto(ConnectionActivitySessionSchema, {
            applicationName: "api-gateway",
            backendAgeSeconds: 3600n,
            blockedByPid: 4211,
            clientAddress: "10.2.0.8",
            clientPort: 55_432,
            databaseName: "logistics",
            durationSeconds: BigInt(38),
            pid: 4302,
            query: "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
            queryAgeSeconds: 38n,
            state: "active",
            transactionAgeSeconds: 38n,
            username: "app_readwrite",
            waitEvent: "transactionid",
            waitEventType: "Lock",
          }),
        ],
        status: HealthCheckStatus.WARNING,
        totalConnections: 44,
        utilizationRatio: 0.44,
        waitingForLockConnections: 1,
      }),
    }),
  });
}

function paginatedActivityHealthResponse() {
  const response = activityHealthResponse();
  const activity = response.health?.connectionActivity;
  if (!activity) {
    throw new Error("Expected activity health fixture.");
  }

  activity.sessions.push(
    ...Array.from({ length: 10 }, (_, index) =>
      createProto(ConnectionActivitySessionSchema, {
        applicationName: "batch-worker",
        databaseName: "logistics",
        durationSeconds: BigInt(index + 1),
        pid: 5000 + index,
        query: `SELECT ${index}`,
        state: "active",
        username: "app_readwrite",
      })
    )
  );

  return response;
}

beforeEach(() => {
  state.activityQueryOptions = undefined;
  state.databases = [];
  state.deleteInstance.mockReset();
  state.deleteInstance.mockResolvedValue(undefined);
  state.extensionData = undefined;
  state.extensionInput = undefined;
  state.healthData = undefined;
  state.healthQueryOptions = undefined;
  state.instanceCatalogError = null;
  state.instanceCatalogHasData = true;
  state.instanceCatalogHasResolved = true;
  state.instanceCatalogIsPending = false;
  state.instanceData = instanceResponse();
  state.instances = [postgresInstanceFixture()];
  state.navigate.mockClear();
  state.navigateToDatabase.mockClear();
  state.overviewData = undefined;
  state.queryClient.getQueryState.mockReset();
  state.queryClient.getQueryState.mockReturnValue(undefined);
  state.queryClient.prefetchQuery.mockReset();
  state.queryClient.prefetchQuery.mockResolvedValue(undefined);
  state.refetchExtensions.mockReset();
  state.refetchExtensions.mockResolvedValue({});
  state.refetchInstance.mockReset();
  state.refetchInstance.mockImplementation(() => {
    state.instanceData = instanceResponse();
    return Promise.resolve({});
  });
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

function renderInstanceActivity() {
  return render(<BackendInstancePage instanceId="prod" section="activity" />);
}

function setFieldValue(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("backend instance configuration save", () => {
  test("requires the operator key before password recovery", () => {
    state.instanceData = instanceResponse({
      credentialError:
        "Stored credentials cannot be read because QUERYLANE_INSTANCE_SECRET_KEY is not configured. Set the key and restart Querylane before replacing the password.",
      credentialState: Instance_CredentialState.KEY_MISSING,
    });
    renderInstanceConfiguration();

    expect(screen.getByText(MISSING_INSTANCE_SECRET_KEY_MESSAGE)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Re-enter password" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty(
      "disabled",
      true
    );
  });

  test("guides unreadable credentials through a full config replacement", async () => {
    const user = userEvent.setup();
    state.instanceData = instanceResponse({
      credentialError:
        "Stored credentials cannot be read. Re-enter the password to restore access.",
      credentialState: Instance_CredentialState.UNREADABLE,
    });
    renderInstanceConfiguration();

    expect(screen.getByText("Credentials need attention")).toBeTruthy();
    expect(
      screen.getByText(
        "Stored credentials can’t be read. Enter the password again to restore access."
      )
    ).toBeTruthy();
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: "Re-enter password" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Password"));
    });
    await user.type(screen.getByLabelText("Password"), "replacement-secret");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(state.updateInstance).toHaveBeenCalledTimes(1);
    });
    expect(state.updateInstance.mock.calls[0]?.[0]?.updateMask.paths).toEqual([
      "config",
    ]);
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

describe("backend instance credential recovery routing", () => {
  test.each([
    Instance_CredentialState.UNREADABLE,
    Instance_CredentialState.KEY_MISSING,
  ])("redirects unavailable credential state %s to configuration", async (credentialState) => {
    state.instanceData = instanceResponse({
      credentialState,
    });
    renderInstanceOverview();

    await waitFor(() => {
      expect(state.navigate).toHaveBeenCalledWith({
        params: { instanceId: "prod" },
        replace: true,
        to: "/instances/$instanceId/configuration",
      });
    });
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

  test("keeps delete available when the only instance credentials are unreadable", () => {
    state.instanceData = instanceResponse({
      credentialState: Instance_CredentialState.UNREADABLE,
    });
    renderInstanceConfiguration();

    const dangerZone = screen.getByTestId("instance-danger-zone");
    expect(
      within(dangerZone).getByRole("button", { name: "Delete instance" })
    ).toHaveProperty("disabled", false);
  });

  test("keeps delete disabled while the instance catalog is pending", () => {
    state.instanceCatalogHasData = false;
    state.instanceCatalogHasResolved = false;
    state.instanceCatalogIsPending = true;
    state.instanceData = instanceResponse({
      credentialState: Instance_CredentialState.UNREADABLE,
    });
    state.instances = [];
    renderInstanceConfiguration();

    expect(
      within(screen.getByTestId("instance-danger-zone")).getByRole("button", {
        name: "Delete instance",
      })
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByText("Checking registered instances before delete.")
    ).toBeTruthy();
  });

  test("keeps delete disabled when the instance catalog failed", () => {
    state.instanceCatalogError = new Error("catalog unavailable");
    state.instanceCatalogHasData = false;
    state.instanceCatalogHasResolved = true;
    state.instanceData = instanceResponse({
      credentialState: Instance_CredentialState.UNREADABLE,
    });
    state.instances = [];
    renderInstanceConfiguration();

    expect(
      within(screen.getByTestId("instance-danger-zone")).getByRole("button", {
        name: "Delete instance",
      })
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByText(
        "Could not verify registered instances. Refresh data before deleting."
      )
    ).toBeTruthy();
  });

  test("opens registration after deleting the only unreadable instance", async () => {
    const user = userEvent.setup();
    state.instanceData = instanceResponse({
      credentialState: Instance_CredentialState.UNREADABLE,
    });
    renderInstanceConfiguration();

    await user.click(screen.getByRole("button", { name: "Delete instance" }));
    await user.type(
      screen.getByRole("textbox", {
        name: "Type instances/prod to confirm",
      }),
      "instances/prod"
    );
    await user.click(screen.getByRole("button", { name: "Delete instance" }));

    await waitFor(() => {
      expect(state.deleteInstance).toHaveBeenCalledWith({
        name: "instances/prod",
      });
    });
    expect(state.navigate).toHaveBeenCalledWith({
      replace: true,
      to: "/new-instance",
    });
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

describe("backend instance activity interactions", () => {
  function openBlockedSessionInspector(
    user: ReturnType<typeof userEvent.setup>
  ) {
    const activity = screen.getByRole("region", { name: "Activity" });
    const table = within(activity).getByRole("table");
    return user
      .click(
        within(table).getByRole("button", {
          name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
        })
      )
      .then(() => screen.findByRole("dialog", { name: "Session 4302" }));
  }

  test("opens the session inspector from a table row", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = activityHealthResponse();

    renderInstanceActivity();

    expect(screen.queryByRole("button", { name: "Terminate…" })).toBeNull();
    const details = await openBlockedSessionInspector(user);

    // Identity line + timeline replace the old duplicated fact tiles.
    expect(
      within(details).getByText(
        "app_readwrite · api-gateway · logistics · 10.2.0.8:55432"
      )
    ).toBeTruthy();
    expect(within(details).getByText("Timeline")).toBeTruthy();
    expect(within(details).getByText("1h 0m ago")).toBeTruthy();
    expect(within(details).getByText("open for 38s")).toBeTruthy();
    expect(within(details).getByText("running for 38s")).toBeTruthy();
    expect(within(details).getByText("Lock · transactionid")).toBeTruthy();
    expect(within(details).getByText(LOCK_WAIT_HINT_PATTERN)).toBeTruthy();
    expect(within(details).getByText("blocked by · pid 4211")).toBeTruthy();
    expect(
      within(details).queryByRole("button", { name: "Terminate session…" })
    ).toBeNull();
    // The sheet is modal, so the inspector carries its own snapshot refresh.
    expect(
      within(details).getByRole("button", { name: "Refresh session" })
    ).toBeTruthy();

    // Jump from the blocked session to its blocker.
    await user.click(within(details).getByRole("button", { name: "Inspect" }));

    const blockerDetails = await screen.findByRole("dialog", {
      name: "Session 4211",
    });
    expect(
      within(blockerDetails).getByText("This session is blocking 1 session.")
    ).toBeTruthy();
    expect(within(blockerDetails).getByText("waiting · pid 4302")).toBeTruthy();
    expect(within(blockerDetails).getByText("open for 4m 12s")).toBeTruthy();
  });

  test("copies the session pid and query from the inspector", async () => {
    const user = userEvent.setup();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = activityHealthResponse();

    try {
      renderInstanceActivity();

      const details = await openBlockedSessionInspector(user);

      await user.click(
        within(details).getByRole("button", { name: "Copy PID" })
      );
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("4302");
      });

      await user.click(
        within(details).getByRole("button", { name: "Copy SQL" })
      );
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          "UPDATE shipping.shipments SET eta = $1 WHERE id = $2"
        );
      });
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  test("shows an ended state when the selected session disappears", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = activityHealthResponse();

    const { rerender } = renderInstanceActivity();

    await openBlockedSessionInspector(user);

    // The next snapshot no longer contains pid 4302.
    const response = activityHealthResponse();
    response.health?.connectionActivity?.sessions.splice(1);
    state.healthData = response;
    rerender(<BackendInstancePage instanceId="prod" section="activity" />);

    const details = await screen.findByRole("dialog", { name: "Session 4302" });
    expect(within(details).getByText("Session ended")).toBeTruthy();
    expect(
      within(details).getByText(
        "This session is no longer visible in pg_stat_activity."
      )
    ).toBeTruthy();
  });
});

describe("backend instance overview redesign", () => {
  test("shows why server info is unavailable while connected", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse({
      includeServerInfo: false,
    });
    state.instanceData.partialErrors = [
      createProto(StatusSchema, {
        details: [
          anyPack(
            ErrorInfoSchema,
            createProto(ErrorInfoSchema, {
              metadata: { metric: "server_info" },
              reason: "METRIC_UNAVAILABLE",
            })
          ),
        ],
        message: "failed to query server info",
      }),
    ];

    renderInstanceOverview();

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Server info unavailable")).toBeTruthy();
    expect(
      within(alert).getByText(
        "Querylane is connected, but couldn’t load live server details: failed to query server info"
      )
    ).toBeTruthy();
  });

  test("keeps replication inside health without a standalone card", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = instanceHealthResponse();

    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });
    expect(
      screen.queryByRole("region", { name: "Replication overview" })
    ).toBeNull();
    expect(
      within(health).getByText(
        "Live checks from this instance's system catalogs."
      )
    ).toBeTruthy();
    expect(within(health).getByText("Replication")).toBeTruthy();
    expect(
      within(health).getByText("Primary · 1 replica streaming")
    ).toBeTruthy();

    await user.click(
      within(health).getByRole("button", { name: REPLICATION_ROW_NAME })
    );

    expect(await within(health).findByText("Role")).toBeTruthy();
    expect(within(health).getByText("Primary")).toBeTruthy();
    expect(within(health).getByText("Streaming replicas")).toBeTruthy();

    expect(
      screen.queryByRole("region", { name: "Storage overview" })
    ).toBeNull();
    expect(screen.queryByText("Connections by application")).toBeNull();
    expect(screen.queryByText("CPU")).toBeNull();
    expect(screen.queryByText("Memory")).toBeNull();
  });

  test("keeps replication facts aligned when server info and health roles disagree", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse({
      replicationRole: ServerInfo_ReplicationRole.PRIMARY,
    });
    state.healthData = instanceHealthResponse({
      replicationRole: ServerInfo_ReplicationRole.REPLICA,
      walReceiverActive: true,
    });

    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });
    const replication = within(health).getByRole("button", {
      name: REPLICATION_WARNING_ROW_NAME,
    });
    expect(
      within(health).getByText(
        "Health check reports Replica. Server info reports Primary."
      )
    ).toBeTruthy();

    await user.click(replication);

    expect(await within(health).findByText("Role")).toBeTruthy();
    expect(within(health).getByText("Primary")).toBeTruthy();
    expect(within(health).getByText("Attached replicas")).toBeTruthy();
    expect(within(health).queryByText("WAL receiver")).toBeNull();
  });
});

describe("backend instance activity", () => {
  test("shows live pg_stat_activity session rows and blocking chain", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = activityHealthResponse();

    renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(
      within(activity).getByText(ACTIVITY_SNAPSHOT_HINT_PATTERN)
    ).toBeTruthy();
    expect(
      within(activity).getByRole("button", { name: "Refresh activity" })
    ).toBeTruthy();
    expect(within(activity).getAllByText("4m 12s").length).toBeGreaterThan(0);
    expect(within(activity).getByText("Blocking chains")).toBeTruthy();
    expect(within(activity).getByText("blocker · pid 4211")).toBeTruthy();
    expect(within(activity).getByText("PID")).toBeTruthy();
    expect(
      within(activity).getAllByText("app_readwrite").length
    ).toBeGreaterThan(0);
    expect(within(activity).getByText("api-gateway")).toBeTruthy();
    expect(
      Array.from(
        activity.querySelectorAll(
          'code.language-sql[data-syntax-highlighter="shiki"]'
        ),
        (code) => code.textContent
      )
    ).toEqual([
      "UPDATE shipping.shipments SET status = 'in_transit', updated_at = now() WHERE id = $1",
      "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
      "UPDATE shipping.shipments SET status = 'in_transit', updated_at = now() WHERE id = $1",
      "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
    ]);
    // The page snapshots on demand now; no background polling interval.
    expect(state.activityQueryOptions).toMatchObject({ enabled: true });
    expect(state.activityQueryOptions?.["refetchInterval"]).toBeUndefined();
    expect(state.healthQueryOptions).toMatchObject({ enabled: false });
  });

  test("filters session rows by URL-backed search and shared facets", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = activityHealthResponse();

    renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    const table = within(activity).getByRole("table");
    const search = within(activity).getByRole("textbox", {
      name: "Search query, user, app…",
    });
    const stateFilter = within(activity).getByRole("button", {
      name: "State",
    });
    const appFilter = within(activity).getByRole("button", { name: "App" });

    expect(appFilter).toBeTruthy();
    // Every fixture session is on "logistics", and single-valued facets hide.
    expect(within(activity).queryByRole("button", { name: "DB" })).toBeNull();

    await user.type(search, "4302");

    expect(
      within(table).getByRole("button", {
        name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
    expect(
      within(table).queryByRole("button", {
        name: BLOCKER_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeNull();
    expect(state.navigate).toHaveBeenLastCalledWith({
      href: "/?q=4302",
      ignoreBlocker: true,
      replace: true,
      resetScroll: false,
    });

    await user.clear(search);
    await user.click(stateFilter);
    await user.click(screen.getByRole("option", { name: "active" }));

    expect(
      within(table).getByRole("button", {
        name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
    expect(
      within(table).queryByRole("button", {
        name: BLOCKER_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeNull();

    await user.click(
      within(activity).getByRole("button", { name: "Clear all" })
    );

    expect(
      within(table).getByRole("button", {
        name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
    expect(
      within(table).getByRole("button", {
        name: BLOCKER_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
    expect(
      within(activity).queryByRole("button", { name: "Clear all" })
    ).toBeNull();

    await user.click(appFilter);
    await user.click(screen.getByRole("option", { name: "api-gateway" }));

    expect(
      within(table).getByRole("button", {
        name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
    expect(
      within(table).queryByRole("button", {
        name: BLOCKER_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeNull();

    await user.click(screen.getByRole("option", { name: "api-gateway" }));

    expect(
      within(table).getByRole("button", {
        name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
    expect(
      within(table).getByRole("button", {
        name: BLOCKER_ACTIVITY_TABLE_ROW_NAME,
      })
    ).toBeTruthy();
  });

  test("paginates the session sample and changes page size", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = paginatedActivityHealthResponse();

    renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    const table = within(activity).getByRole("table");
    const search = within(activity).getByRole("textbox", {
      name: "Search query, user, app…",
    });
    const nextPage = within(activity).getByRole("button", {
      name: "Next page",
    });
    const previousPage = within(activity).getByRole("button", {
      name: "Previous page",
    });
    const pageSize = within(activity).getByRole("combobox", {
      name: "Rows per page",
    });

    expect(within(activity).getByText("Page 1 of 2")).toBeTruthy();
    expect(within(table).queryByText("5000")).toBeNull();
    expect(nextPage).toHaveProperty("disabled", false);
    expect(previousPage).toHaveProperty("disabled", true);

    await user.click(nextPage);

    expect(within(activity).getByText("Page 2 of 2")).toBeTruthy();
    expect(within(table).getByText("5000")).toBeTruthy();
    expect(within(table).queryByText("4211")).toBeNull();
    expect(previousPage).toHaveProperty("disabled", false);

    await user.click(previousPage);

    expect(within(activity).getByText("Page 1 of 2")).toBeTruthy();
    expect(within(table).getByText("4211")).toBeTruthy();
    expect(previousPage).toHaveProperty("disabled", true);

    await user.click(nextPage);

    await user.type(search, "4211");

    expect(within(activity).getByText("Page 1 of 1")).toBeTruthy();
    expect(within(table).getByText("4211")).toBeTruthy();

    await user.clear(search);

    expect(within(activity).getByText("Page 1 of 2")).toBeTruthy();
    expect(within(table).getByText("4211")).toBeTruthy();

    await user.click(nextPage);
    await user.click(within(activity).getByRole("button", { name: "State" }));
    await user.click(screen.getByRole("option", { name: "active" }));

    expect(within(activity).getByText("Page 1 of 2")).toBeTruthy();
    expect(within(table).getByText("4302")).toBeTruthy();
    expect(within(activity).getByText("Showing 1–10 of 11")).toBeTruthy();

    await user.click(
      within(activity).getByRole("button", { name: "Clear all" })
    );

    await user.click(pageSize);
    await user.click(screen.getByRole("option", { name: "25" }));

    expect(within(activity).getByText("Page 1 of 1")).toBeTruthy();
    expect(within(table).getByText("5000")).toBeTruthy();
    expect(nextPage).toHaveProperty("disabled", true);

    await user.click(pageSize);
    await user.click(screen.getByRole("option", { name: "10" }));

    expect(within(activity).getByText("Page 1 of 2")).toBeTruthy();
    expect(within(table).queryByText("5000")).toBeNull();
    expect(nextPage).toHaveProperty("disabled", false);
  });
});

describe("backend instance activity pagination and states", () => {
  test("clamps the current page when a live sample shrinks", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = paginatedActivityHealthResponse();

    const { rerender } = renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    const table = within(activity).getByRole("table");
    const nextPage = within(activity).getByRole("button", {
      name: "Next page",
    });
    const previousPage = within(activity).getByRole("button", {
      name: "Previous page",
    });

    await user.click(nextPage);

    expect(within(activity).getByText("Page 2 of 2")).toBeTruthy();
    expect(within(table).getByText("5000")).toBeTruthy();

    state.healthData = activityHealthResponse();
    rerender(<BackendInstancePage instanceId="prod" section="activity" />);

    expect(within(activity).getByText("Page 1 of 1")).toBeTruthy();
    expect(within(table).getByText("4211")).toBeTruthy();
    expect(within(table).getByText("4302")).toBeTruthy();
    expect(within(table).queryByText("5000")).toBeNull();
    expect(previousPage).toHaveProperty("disabled", true);
    expect(nextPage).toHaveProperty("disabled", true);
  });

  test("shows the empty sessions state", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = createProto(CheckInstanceHealthResponseSchema, {
      health: createProto(InstanceHealthSchema, {
        connectionActivity: createProto(ConnectionActivityHealthSchema, {
          totalConnections: 2,
        }),
      }),
    });

    renderInstanceActivity();

    expect(screen.getByText("No sessions found")).toBeTruthy();
    expect(screen.getByText("Try a different search or filter.")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Rows per page" })
    ).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  test("shows unavailable placeholders and the activity partial error", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.healthData = createProto(CheckInstanceHealthResponseSchema, {
      health: createProto(InstanceHealthSchema),
      partialErrors: [
        createProto(StatusSchema, {
          message: "permission denied for pg_stat_activity",
        }),
      ],
    });

    renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getAllByText("—")).toHaveLength(6);
    expect(
      within(activity).getByText("Activity data unavailable")
    ).toBeTruthy();
    expect(
      within(activity).getByText("permission denied for pg_stat_activity")
    ).toBeTruthy();
  });

  test("shows Activity unavailable instead of loading forever when disconnected", () => {
    state.healthData = activityHealthResponse();

    renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getAllByText("—")).toHaveLength(6);
    expect(within(activity).getByText("Activity unavailable")).toBeTruthy();
    expect(
      within(activity).getByText(
        "Connect the instance before Querylane can read pg_stat_activity."
      )
    ).toBeTruthy();
    expect(within(activity).queryByText("Loading activity...")).toBeNull();
  });

  test("shows both directions of a chained lock in the inspector", async () => {
    const user = userEvent.setup();
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    const response = activityHealthResponse();
    response.health?.connectionActivity?.sessions.push(
      createProto(ConnectionActivitySessionSchema, {
        applicationName: "api-gateway",
        blockedByPid: 4302,
        databaseName: "logistics",
        durationSeconds: 12n,
        pid: 4318,
        query: "SELECT * FROM shipping.shipments FOR UPDATE",
        state: "active",
        username: "app_readwrite",
      })
    );
    state.healthData = response;

    renderInstanceActivity();

    const activity = screen.getByRole("region", { name: "Activity" });
    const table = within(activity).getByRole("table");
    await user.click(
      within(table).getByRole("button", {
        name: BLOCKED_ACTIVITY_TABLE_ROW_NAME,
      })
    );

    // 4302 sits mid-chain: blocked by 4211 while blocking 4318.
    const details = await screen.findByRole("dialog", { name: "Session 4302" });
    expect(within(details).getByText("blocked by · pid 4211")).toBeTruthy();
    expect(
      within(details).getByText("This session is blocking 1 session.")
    ).toBeTruthy();
    expect(within(details).getByText("waiting · pid 4318")).toBeTruthy();
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
    ).toEqual(["Kind", "Owner", "Encoding"]);

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

    await user.click(
      within(filterRail).getByRole("button", { name: "Clear all" })
    );

    expect(document.activeElement).toBe(search);
    expect(await screen.findByText("customer_events")).toBeTruthy();
    expect(screen.getByText("analytics_archive")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "postgres postgres UTF8 C System",
      })
    ).toBeTruthy();
  });

  test("opens database overview when a database row is selected", async () => {
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
    ];

    renderInstanceOverview();

    await user.click(screen.getByText("customer_events"));

    expect(state.navigateToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceName: "instances/prod/databases/customer-events",
      }),
      { overridePage: "database.overview" }
    );
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
