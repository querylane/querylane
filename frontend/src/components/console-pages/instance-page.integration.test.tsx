import { create as createProto } from "@bufbuild/protobuf";
import { anyPack } from "@bufbuild/protobuf/wkt";
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
  type GetInstanceOverviewResponse,
  GetInstanceOverviewResponseSchema,
  type GetInstanceResponse,
  GetInstanceResponseSchema,
  InstanceOverviewSchema,
  InstanceSchema,
  IOMetricsSchema,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  PostgresConfigSchema,
  ServerInfo_ReplicationRole,
  ServerInfoSchema,
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
const CHARSET_COLUMN_NAME = /^charset/i;
const COLLATION_COLUMN_NAME = /^collation/i;

const state = vi.hoisted(() => ({
  databases: [] as PostgresDatabase[],
  extensionData: undefined as ListExtensionsResponse | undefined,
  extensionInput: undefined as
    | { filter?: string; orderBy?: string; pageSize?: number; parent: string }
    | undefined,
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
  selectedInstanceStatus: "disconnected" as "connected" | "disconnected",
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

vi.mock("@/hooks/api/instance", () => ({
  refreshAllInstancesCache: (input: RefreshAllInstancesCacheInput) =>
    state.refreshAllInstancesCache(input),
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
    lastConnectionCheckTime: undefined,
    name: "Production",
    port: 5432,
    resourceName: "instances/prod",
    status,
  };
}

function instanceResponse() {
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
      replicationRole: ServerInfo_ReplicationRole.PRIMARY,
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
    ],
  });
}

function overviewResponse() {
  return createProto(GetInstanceOverviewResponseSchema, {
    instanceOverview: createProto(InstanceOverviewSchema, {
      ioMetrics: createProto(IOMetricsSchema, {
        extendBytes: 16_384n,
        extends: 2n,
        fsyncs: 1n,
        readBytes: 57_344n,
        reads: 7n,
        writeBytes: 24_576n,
        writes: 3n,
      }),
    }),
  });
}

function ioPartialErrorResponse() {
  const detail = anyPack(
    ErrorInfoSchema,
    createProto(ErrorInfoSchema, {
      metadata: { metric: "io" },
      reason: "METRIC_UNAVAILABLE",
    })
  );

  return createProto(GetInstanceOverviewResponseSchema, {
    instanceOverview: createProto(InstanceOverviewSchema, {}),
    partialErrors: [
      createProto(StatusSchema, {
        details: [detail],
        message: "failed to query I/O metrics",
      }),
    ],
  });
}

beforeEach(() => {
  state.databases = [];
  state.extensionData = undefined;
  state.extensionInput = undefined;
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

describe("backend instance I/O metrics", () => {
  test("shows pg_stat_io read/write/extend/fsync metrics", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.overviewData = overviewResponse();

    renderInstanceOverview();

    expect(screen.getByText("I/O reads")).toBeTruthy();
    expect(screen.getByText("56 KB")).toBeTruthy();
    expect(screen.getByText("7 ops")).toBeTruthy();
    expect(screen.getByText("I/O writes")).toBeTruthy();
    expect(screen.getByText("24 KB")).toBeTruthy();
    expect(screen.getByText("3 ops")).toBeTruthy();
    expect(screen.getByText("I/O extends")).toBeTruthy();
    expect(screen.getByText("16 KB")).toBeTruthy();
    expect(screen.getByText("2 ops")).toBeTruthy();
    expect(screen.getByText("I/O fsyncs")).toBeTruthy();
    expect(screen.getByText("1 call")).toBeTruthy();
  });

  test("shows pg_stat_io fallback notice when unavailable", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.overviewData = ioPartialErrorResponse();

    renderInstanceOverview();

    expect(screen.getAllByText("failed to query I/O metrics")).toHaveLength(4);
  });
});

describe("backend instance health checks", () => {
  test("shows real health check statuses from existing instance data", () => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse();
    state.extensionData = extensionInventoryResponse();

    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });

    expect(within(health).getByText("TCP")).toBeTruthy();
    expect(within(health).getByText("Reachable")).toBeTruthy();
    expect(within(health).getByText("TLS")).toBeTruthy();
    expect(within(health).getByText("Opportunistic")).toBeTruthy();
    expect(
      within(health).getByText(
        "prefer / postgres; may use plaintext fallback; no handshake observed"
      )
    ).toBeTruthy();
    expect(within(health).getByText("Authentication")).toBeTruthy();
    expect(within(health).getByText("Accepted")).toBeTruthy();
    expect(within(health).getByText("Replication")).toBeTruthy();
    expect(within(health).getByText("Detected")).toBeTruthy();
    expect(within(health).getByText("primary server")).toBeTruthy();
    expect(within(health).getByText("pg_stat_statements")).toBeTruthy();
    expect(within(health).getByText("Installed")).toBeTruthy();
    expect(state.extensionInput).toEqual({
      filter: 'name = "pg_stat_statements"',
      orderBy: "name asc",
      pageSize: 1,
      parent: "instances/prod/databases/postgres",
    });
  });

  test.each([
    [
      PostgresConfig_SslMode.ALLOW,
      "allow / postgres; may use plaintext fallback; no handshake observed",
    ],
    [
      PostgresConfig_SslMode.PREFER,
      "prefer / postgres; may use plaintext fallback; no handshake observed",
    ],
  ])("labels ssl mode %s as opportunistic, not configured", (sslMode, value) => {
    state.selectedInstanceStatus = "connected";
    state.instances = [postgresInstanceFixture("connected")];
    state.instanceData = connectedInstanceResponse({ sslMode });

    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });
    const tls = within(health).getByRole("group", {
      name: "TLS health check",
    });

    expect(within(tls).getByText("Opportunistic")).toBeTruthy();
    expect(within(tls).getByText(value)).toBeTruthy();
    expect(within(tls).queryByText("Configured")).toBeNull();
  });

  test("does not report pg_stat_statements when extension inventory was not checked", () => {
    renderInstanceOverview();

    const health = screen.getByRole("region", { name: "Health checks" });
    const pgStatStatements = within(health).getByRole("group", {
      name: "pg_stat_statements health check",
    });

    expect(within(pgStatStatements).getByText("Not checked")).toBeTruthy();
    expect(
      within(pgStatStatements).getByText("inventory not checked")
    ).toBeTruthy();
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
