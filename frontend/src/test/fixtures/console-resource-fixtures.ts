import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { anyPack, timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  type ConnectRouter,
  type ServiceImpl,
} from "@connectrpc/connect";
import {
  BadRequestSchema,
  ErrorInfoSchema,
} from "../../protogen/google/rpc/error_details_pb";
import type { StatusSchema } from "../../protogen/google/rpc/status_pb";
import {
  AppDatabaseStatus_State,
  ConsoleService,
  GetConsoleConfigResponseSchema,
  InstanceManagementMode,
} from "../../protogen/querylane/console/v1alpha1/console_pb";
import {
  type DatabaseQueryInsightsSchema,
  type DatabaseSchema,
  DatabaseService,
  GetDatabaseQueryInsightsResponseSchema,
  GetDatabaseResponseSchema,
  ListDatabasesResponseSchema,
} from "../../protogen/querylane/console/v1alpha1/database_pb";
import {
  type ExtensionSchema,
  ExtensionService,
  ListExtensionsResponseSchema,
} from "../../protogen/querylane/console/v1alpha1/extension_pb";
import {
  CheckInstanceActivityResponseSchema,
  CheckInstanceHealthResponseSchema,
  type ConnectionActivityHealthSchema,
  DeleteInstanceResponseSchema,
  GetInstanceOverviewResponseSchema,
  GetInstanceResponseSchema,
  HealthCheckStatus,
  Instance_ConnectionState,
  type InstanceSchema,
  InstanceService,
  ListInstancesResponseSchema,
  PostgresConfig_SslMode,
  ServerInfo_ReplicationRole,
  UpdateInstanceResponseSchema,
} from "../../protogen/querylane/console/v1alpha1/instance_pb";
import {
  MetricId,
  MetricKind,
  MetricsService,
  MetricUnit,
  QueryMetricsResponseSchema,
} from "../../protogen/querylane/console/v1alpha1/metrics_pb";
import {
  ListSchemasResponseSchema,
  type SchemaSchema,
  SchemaService,
} from "../../protogen/querylane/console/v1alpha1/schema_pb";
import { SQLService } from "../../protogen/querylane/console/v1alpha1/sql_pb";
import {
  ListTablesResponseSchema,
  Table_TableType,
  type TableSchema,
  TableService,
} from "../../protogen/querylane/console/v1alpha1/table_pb";
import {
  ListViewsResponseSchema,
  View_ViewType,
  type ViewSchema,
  ViewService,
} from "../../protogen/querylane/console/v1alpha1/view_pb";

// One source of instance and database console data for rstest (served through
// createTestRouterTransport) and Playwright (served as Connect JSON through
// page.route). Relative imports keep this module loadable from Playwright.

const CONSOLE_INSTANCE_ID = "production";
const CONSOLE_DATABASE_ID = "customer-events";
const INSTANCE = `instances/${CONSOLE_INSTANCE_ID}`;
const DATABASE = `${INSTANCE}/databases/${CONSOLE_DATABASE_ID}`;
/** Frozen clock so "Last refreshed" and relative ages stay stable. */
const CONSOLE_FIXED_NOW = new Date("2026-05-20T12:00:00Z");

type ActivityInit = MessageInitShape<typeof ConnectionActivityHealthSchema>;
type DatabaseInit = MessageInitShape<typeof DatabaseSchema>;
type ExtensionInit = MessageInitShape<typeof ExtensionSchema>;
type InstanceInit = MessageInitShape<typeof InstanceSchema>;
type QueryInsightsInit = MessageInitShape<typeof DatabaseQueryInsightsSchema>;
type StatusInit = MessageInitShape<typeof StatusSchema>;

const consoleInstance: InstanceInit = {
  config: {
    database: "postgres",
    host: "analytics-writer.internal.querylane.test",
    port: 5432,
    sslMode: PostgresConfig_SslMode.PREFER,
    username: "postgres",
  },
  connectionState: Instance_ConnectionState.ACTIVE,
  displayName: "Production Analytics Writer",
  labels: { environment: "production", team: "data-platform" },
  name: INSTANCE,
};

// A second instance keeps delete enabled: the last instance cannot go.
const archiveInstance: InstanceInit = {
  ...consoleInstance,
  config: { host: "archive.internal.querylane.test", port: 5432 },
  connectionError: "connection refused",
  connectionState: Instance_ConnectionState.ERROR,
  displayName: "Archive Instance",
  labels: {},
  name: "instances/archive",
};

function database(displayName: string, fields: DatabaseInit = {}) {
  return {
    characterSet: "UTF8",
    collation: "en_US.UTF-8",
    displayName,
    name: `${INSTANCE}/databases/${displayName}`,
    owner: "data-platform",
    ...fields,
  } satisfies DatabaseInit;
}

const consoleDatabase = database("customer_events", { name: DATABASE });

function connectionActivity(overrides: ActivityInit = {}): ActivityInit {
  return {
    activeConnections: 18,
    idleConnections: 54,
    idleInTransactionConnections: 2,
    maxConnections: 100,
    status: HealthCheckStatus.OK,
    summary: "74 connections",
    totalConnections: 74,
    utilizationRatio: 0.74,
    ...overrides,
  };
}

function session(fields: NonNullable<ActivityInit["sessions"]>[number]) {
  return { databaseName: "logistics", username: "app_readwrite", ...fields };
}

/** Live sessions with one blocking chain (4211 blocks 4302 and 4318). */
const busyActivity = connectionActivity({
  activeConnections: 41,
  byApplication: [
    {
      activeConnections: 20,
      applicationName: "api-gateway",
      idleConnections: 14,
      idleInTransactionConnections: 0,
      totalConnections: 34,
    },
    {
      activeConnections: 8,
      applicationName: "worker-pool",
      idleConnections: 20,
      idleInTransactionConnections: 5,
      totalConnections: 33,
    },
    {
      activeConnections: 3,
      applicationName: "metabase",
      idleConnections: 11,
      idleInTransactionConnections: 0,
      totalConnections: 14,
    },
  ],
  idleConnections: 118,
  idleInTransactionConnections: 9,
  longestTransactionSeconds: 252n,
  longRunningTransactionConnections: 1,
  maxConnections: 250,
  sessions: [
    session({
      applicationName: "worker-pool",
      backendAgeSeconds: 7200n,
      clientAddress: "10.2.0.7",
      clientPort: 51_234,
      durationSeconds: 252n,
      pid: 4211,
      query:
        "UPDATE shipping.shipments SET status = 'in_transit', updated_at = now() WHERE id = $1",
      queryAgeSeconds: 180n,
      state: "idle in transaction",
      transactionAgeSeconds: 252n,
    }),
    session({
      applicationName: "api-gateway",
      backendAgeSeconds: 3600n,
      blockedByPid: 4211,
      clientAddress: "10.2.0.8",
      clientPort: 55_432,
      durationSeconds: 38n,
      pid: 4302,
      query: "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
      queryAgeSeconds: 38n,
      state: "active",
      transactionAgeSeconds: 38n,
      waitEvent: "transactionid",
      waitEventType: "Lock",
    }),
    session({
      applicationName: "api-gateway",
      backendAgeSeconds: 1800n,
      blockedByPid: 4211,
      clientAddress: "10.2.0.9",
      clientPort: 50_711,
      durationSeconds: 21n,
      pid: 4318,
      query: "SELECT * FROM shipping.shipments WHERE id = $1 FOR UPDATE",
      queryAgeSeconds: 21n,
      state: "active",
      transactionAgeSeconds: 21n,
      waitEvent: "tuple",
      waitEventType: "Lock",
    }),
    session({
      applicationName: "api-gateway",
      backendAgeSeconds: 60n,
      clientAddress: "10.2.0.10",
      clientPort: 49_882,
      durationSeconds: 0n,
      pid: 3987,
      query:
        "SELECT s.*, c.name FROM shipping.shipments s JOIN shipping.carriers c ON c.id = s.carrier_id WHERE s.status = ANY($1)",
      queryAgeSeconds: 0n,
      state: "active",
    }),
    session({
      applicationName: "metabase",
      backendAgeSeconds: 5400n,
      clientAddress: "10.3.1.4",
      clientPort: 60_125,
      databaseName: "billing",
      durationSeconds: 2n,
      pid: 4402,
      query:
        "SELECT date_trunc('week', issued_at) AS wk, sum(amount) FROM billing.invoices GROUP BY 1 ORDER BY 1",
      queryAgeSeconds: 2n,
      state: "active",
      transactionAgeSeconds: 2n,
      username: "analytics_reader",
    }),
  ],
  status: HealthCheckStatus.WARNING,
  summary: "171 connections",
  totalConnections: 171,
  utilizationRatio: 0.684,
  waitingForLockConnections: 3,
});

function extension(
  displayName: string,
  fields: { comment: string; defaultVersion: string; installedVersion?: string }
): ExtensionInit {
  return {
    ...fields,
    displayName,
    installed: fields.installedVersion !== undefined,
    name: `${DATABASE}/extensions/${displayName}`,
    schema: fields.installedVersion === undefined ? "" : "public",
  };
}

const designExtensions: ExtensionInit[] = [
  extension("pg_stat_statements", {
    comment: "Track planning and execution statistics of all SQL statements",
    defaultVersion: "1.10",
    installedVersion: "1.10",
  }),
  extension("pgcrypto", {
    comment:
      "Cryptographic functions — hashing, HMAC, symmetric and public-key encryption",
    defaultVersion: "1.3",
    installedVersion: "1.3",
  }),
  extension("uuid-ossp", {
    comment: "Generate universally unique identifiers (v1, v3, v4, v5)",
    defaultVersion: "1.1",
    installedVersion: "1.1",
  }),
  extension("pg_trgm", {
    comment:
      "Trigram matching — fuzzy text search and fast LIKE/ILIKE indexing",
    defaultVersion: "1.6",
    installedVersion: "1.6",
  }),
  extension("pgvector", {
    comment:
      "Vector similarity search — embeddings storage with HNSW and IVFFlat indexes",
    defaultVersion: "0.8.0",
    installedVersion: "v0.8.0",
  }),
  extension("postgis", {
    comment:
      "Geospatial types, indexes, and functions — points, polygons, distances, projections",
    defaultVersion: "3.4.2",
    installedVersion: "v3.4.2",
  }),
  extension("timescaledb", {
    comment:
      "Hypertables — automatic time partitioning, compression, and continuous aggregates",
    defaultVersion: "2.17",
  }),
];

interface CatalogFixture {
  schemas: MessageInitShape<typeof SchemaSchema>[];
  /** Keyed by schema id. */
  tables: Record<string, MessageInitShape<typeof TableSchema>[]>;
  /** Keyed by schema id. */
  views: Record<string, MessageInitShape<typeof ViewSchema>[]>;
}

function catalogSchema(schemaId: string) {
  return {
    displayName: schemaId,
    name: `${DATABASE}/schemas/${schemaId}`,
    owner: "data-platform",
  };
}

function catalogTable(
  schemaId: string,
  displayName: string,
  { rowCount, sizeBytes }: { rowCount: bigint; sizeBytes: bigint }
) {
  return {
    displayName,
    name: `${DATABASE}/schemas/${schemaId}/tables/${displayName}`,
    owner: "data-platform",
    rowCount,
    sizeBytes,
    tableType: Table_TableType.BASE_TABLE,
  };
}

const consoleCatalog: CatalogFixture = {
  schemas: ["analytics", "public"].map(catalogSchema),
  tables: {
    public: [
      catalogTable("public", "events", {
        rowCount: 1_280_000n,
        sizeBytes: 5_368_709_120n,
      }),
    ],
  },
  views: {
    analytics: [
      {
        displayName: "daily_rollup",
        isPopulated: true,
        name: `${DATABASE}/schemas/analytics/views/daily_rollup`,
        owner: "data-platform",
        rowCount: 4200n,
        sizeBytes: 268_435_456n,
        viewType: View_ViewType.MATERIALIZED,
      },
    ],
  },
};

function queryInsights({
  queryStatsAvailable = true,
  tableStatsAvailable = true,
} = {}): QueryInsightsInit {
  return {
    observedAt: timestampFromDate(CONSOLE_FIXED_NOW),
    queryStatsAvailable,
    sequentialScanHotspots: tableStatsAvailable
      ? [
          {
            estimatedLiveRows: 50_000n,
            indexScans: 3n,
            schemaName: "public",
            sequentialScanRatio: 0.8,
            sequentialScans: 12n,
            sequentialTuplesRead: 120_000n,
            tableName: "events",
            totalSizeBytes: 268_435_456n,
          },
        ]
      : [],
    tableCacheHits: tableStatsAvailable
      ? [
          {
            heapBlocksHit: 900n,
            heapBlocksRead: 100n,
            hitRatio: 0.9,
            schemaName: "public",
            tableName: "events",
            totalSizeBytes: 268_435_456n,
          },
          {
            heapBlocksHit: 500n,
            heapBlocksRead: 250n,
            hitRatio: 0.67,
            schemaName: "analytics",
            tableName: "daily_rollup_cache",
            totalSizeBytes: 134_217_728n,
          },
        ]
      : [],
    tableStatsAvailable,
    topQueries: queryStatsAvailable
      ? [
          {
            calls: 42n,
            meanTimeMs: 20,
            query: "SELECT * FROM events WHERE account_id = $1",
            queryId: 123n,
            totalTimeMs: 840,
            totalTimeRatio: 1,
          },
          {
            calls: 8n,
            meanTimeMs: 26.25,
            query: "UPDATE events SET processed_at = $1 WHERE id = $2",
            queryId: 456n,
            totalTimeMs: 210,
            totalTimeRatio: 0.25,
          },
        ]
      : [],
  };
}

const METRIC_START = Date.parse("2026-05-20T11:00:00Z");
const METRIC_WINDOW_MS = 3_600_000;
const METRIC_STEP_SECONDS = 300n;

/** Space-separated samples keep the five-minute series readable. */
function samples(unit: MetricUnit, values: string) {
  return { unit, values: values.split(" ").map(Number) };
}

const METRIC_VALUES: Partial<Record<MetricId, ReturnType<typeof samples>>> = {
  [MetricId.CACHE_HIT_RATIO]: samples(
    MetricUnit.RATIO,
    "0.982 0.985 0.981 0.988 0.986 0.989 0.987 0.991 0.99 0.988 0.992 0.989 0.991"
  ),
  [MetricId.CONNECTIONS_TOTAL]: samples(
    MetricUnit.COUNT,
    "68 70 69 72 71 74 73 76 74 75 77 74 74"
  ),
  [MetricId.DATABASE_DEAD_TUPLES]: samples(
    MetricUnit.COUNT,
    "8100 7900 7600 8300 8800 8600 8200 7800 7500 7300 7100 6900 6700"
  ),
  [MetricId.DATABASE_LIVE_TUPLES]: samples(
    MetricUnit.COUNT,
    "1220000 1225000 1228000 1232000 1238000 1241000 1245000 1249000 1252000 1257000 1261000 1265000 1270000"
  ),
  [MetricId.DATABASE_SIZE_BYTES]: samples(
    MetricUnit.BYTES,
    "58900000 59000000 59100000 59300000 59500000 59700000 59900000 60000000 60100000 60200000 60300000 60400000 60500000"
  ),
  [MetricId.STORAGE_TOTAL_BYTES]: samples(
    MetricUnit.BYTES,
    "1.17e12 1.18e12 1.19e12 1.2e12 1.21e12 1.22e12 1.23e12 1.24e12 1.25e12 1.26e12 1.27e12 1.28e12 1.29e12"
  ),
};

/** Serves the requested metric ids with a steady hour of samples. */
function metricsResponse(metrics: MetricId[]) {
  const startTime = timestampFromDate(new Date(METRIC_START));
  return create(QueryMetricsResponseSchema, {
    interval: {
      endTime: timestampFromDate(new Date(METRIC_START + METRIC_WINDOW_MS)),
      startTime,
    },
    series: metrics.flatMap((metric) => {
      const series = METRIC_VALUES[metric];
      return series
        ? [
            {
              delta: {
                currentValue: series.values.at(-1) ?? 0,
                percentChange: 4.2,
              },
              kind: MetricKind.GAUGE,
              metric,
              points: {
                startTime,
                step: { seconds: METRIC_STEP_SECONDS },
                values: series.values,
              },
              unit: series.unit,
            },
          ]
        : [];
    }),
  });
}

// Long display names stress the header, breadcrumbs, and sidebar truncation.
const LONG_INSTANCE_NAME = "Production Analytics Writer With Long Display Name";
const LONG_DATABASE_NAME = "customer_events_with_long_identifier";

function shippingTable(displayName: string, rowCount: { rowCount: bigint }) {
  return catalogTable("public", displayName, {
    ...rowCount,
    sizeBytes: 1_048_576n,
  });
}

const longDatabase = { ...consoleDatabase, displayName: LONG_DATABASE_NAME };

/** The database overview inside the full app shell, config-managed. */
const ADMIN_SHELL_FIXTURE = {
  catalog: {
    schemas: [catalogSchema("public")],
    tables: {
      public: [
        shippingTable("carriers", { rowCount: 312n }),
        shippingTable("containers", { rowCount: 88_000n }),
        shippingTable("shipment_event", { rowCount: 18_200_000n }),
        shippingTable("shipments", { rowCount: 2_400_000n }),
      ],
    },
    views: {
      public: [
        {
          displayName: "active_shipments",
          isPopulated: true,
          name: `${DATABASE}/schemas/public/views/active_shipments`,
          owner: "data-platform",
          viewType: View_ViewType.STANDARD,
        },
      ],
    },
  },
  configManaged: true,
  database: longDatabase,
  databases: [longDatabase, database("warehouse")],
  instance: { ...consoleInstance, displayName: LONG_INSTANCE_NAME },
} satisfies Partial<ConsoleResourceFixture>;

type ConsoleRpc = "checkInstanceActivity" | "listInstances";

/**
 * Services read these fields on every call, so a test can change one after
 * the first load (say, to fail the next refresh).
 */
interface ConsoleResourceFixture {
  /** `null` reports the activity check as a permission partial error. */
  activity: ActivityInit | null; // allow: proto-null fixture knob, not a proto field
  catalog: CatalogFixture;
  configManaged: boolean;
  database: DatabaseInit;
  databases: DatabaseInit[];
  extensions: ExtensionInit[];
  instance: InstanceInit;
  /** Instance and overview loads fail with a meta database outage. */
  metaDatabaseUnavailable: boolean;
  metrics: boolean;
  /** Rejects instance updates with this password field violation. */
  passwordRejection?: string;
  /** RPCs that never answer, to hold the UI mid-refresh. */
  pending: readonly ConsoleRpc[];
  queryInsights: QueryInsightsInit;
  schemasTruncated: boolean;
  /** Omits server info and reports this partial error instead. */
  serverInfoError?: string;
}

function consoleResourceFixture(
  overrides: Partial<ConsoleResourceFixture> = {}
): ConsoleResourceFixture {
  return {
    activity: connectionActivity(),
    catalog: consoleCatalog,
    configManaged: false,
    database: consoleDatabase,
    databases: [
      consoleDatabase,
      database("orders"),
      database("postgres", {
        collation: "C",
        isSystemDatabase: true,
        owner: "postgres",
      }),
    ],
    extensions: [
      extension("pg_stat_statements", {
        comment: "",
        defaultVersion: "1.10",
        installedVersion: "1.10",
      }),
    ],
    instance: consoleInstance,
    metaDatabaseUnavailable: false,
    metrics: false,
    pending: [],
    queryInsights: queryInsights({
      queryStatsAvailable: false,
      tableStatsAvailable: false,
    }),
    schemasTruncated: false,
    ...overrides,
  };
}

function leafId(resourceName: string) {
  return resourceName.split("/").at(-1) ?? "";
}

const NEVER = new Promise<never>(() => undefined);

function metaDatabaseUnavailableError() {
  return new ConnectError(
    "meta database is unavailable",
    Code.Unavailable,
    undefined,
    [
      {
        desc: ErrorInfoSchema,
        value: {
          domain: "console.querylane.dev",
          reason: "ERROR_REASON_APP_DATABASE_UNAVAILABLE",
        },
      },
    ]
  );
}

function serverInfoPartialError(message: string): StatusInit {
  return {
    details: [
      anyPack(
        ErrorInfoSchema,
        create(ErrorInfoSchema, {
          metadata: { metric: "server_info" },
          reason: "METRIC_UNAVAILABLE",
        })
      ),
    ],
    message,
  };
}

/**
 * Connect service implementations for the instance and database console
 * routes. Pass them to `createTestRouterTransport` in rstest or `serveService`
 * in Playwright (which serves the unary methods; `sql` streams).
 */
function consoleResourceServices(fixture: ConsoleResourceFixture) {
  function answer<T>(rpc: ConsoleRpc, response: () => T): Promise<T> {
    return fixture.pending.includes(rpc) ? NEVER : Promise.resolve(response());
  }
  function instanceLoad<T>(response: () => T): Promise<T> {
    return fixture.metaDatabaseUnavailable
      ? Promise.reject(metaDatabaseUnavailableError())
      : Promise.resolve(response());
  }

  const instance: Partial<ServiceImpl<typeof InstanceService>> = {
    checkInstanceActivity: () =>
      answer("checkInstanceActivity", () =>
        create(
          CheckInstanceActivityResponseSchema,
          fixture.activity
            ? { activity: fixture.activity }
            : {
                partialErrors: [
                  {
                    code: Code.PermissionDenied,
                    message: "permission denied for pg_stat_activity",
                  },
                ],
              }
        )
      ),
    checkInstanceHealth: () =>
      create(CheckInstanceHealthResponseSchema, {
        health: {
          connectionActivity: connectionActivity(),
          replication: {
            attachedReplicas: 2,
            maxReplicationLagBytes: 86_000_000n,
            role: ServerInfo_ReplicationRole.PRIMARY,
            status: HealthCheckStatus.OK,
            streamingReplicas: 2,
            summary: "primary with 2 attached replicas",
          },
        },
      }),
    deleteInstance: () => create(DeleteInstanceResponseSchema),
    getInstance: () =>
      instanceLoad(() =>
        create(
          GetInstanceResponseSchema,
          fixture.serverInfoError === undefined
            ? {
                instance: fixture.instance,
                serverInfo: {
                  maxConnections: 250,
                  replicationRole: ServerInfo_ReplicationRole.PRIMARY,
                  versionNum: 170_004,
                  versionShort: "17.4",
                },
              }
            : {
                instance: fixture.instance,
                partialErrors: [
                  serverInfoPartialError(fixture.serverInfoError),
                ],
              }
        )
      ),
    getInstanceOverview: () =>
      instanceLoad(() =>
        create(GetInstanceOverviewResponseSchema, {
          instanceOverview: {
            cache: {
              blocksHit: 987_654n,
              blocksRead: 12_345n,
              hitRatio: 0.988,
            },
            connections: {
              activeConnections: 18,
              idleConnections: 56,
              maxConnections: 250,
              totalConnections: 74,
            },
            storage: { totalSizeBytes: 1_250_000_000_000n },
          },
        })
      ),
    listInstances: () =>
      answer("listInstances", () =>
        create(ListInstancesResponseSchema, {
          instances: [fixture.instance, archiveInstance],
        })
      ),
    updateInstance: ({ instance: updated }) => {
      if (fixture.passwordRejection === undefined) {
        return create(UpdateInstanceResponseSchema, {
          instance: updated ?? {},
        });
      }
      throw new ConnectError(
        fixture.passwordRejection,
        Code.InvalidArgument,
        undefined,
        [
          {
            desc: BadRequestSchema,
            value: {
              fieldViolations: [
                {
                  description: fixture.passwordRejection,
                  field: "instance.config.password",
                },
              ],
            },
          },
        ]
      );
    },
  };

  const console: Partial<ServiceImpl<typeof ConsoleService>> = {
    getConsoleConfig: () =>
      create(GetConsoleConfigResponseSchema, {
        databaseStatus: {
          schemaVersion: 1,
          state: AppDatabaseStatus_State.READY,
        },
        instanceManagementMode: fixture.configManaged
          ? InstanceManagementMode.CONFIG
          : InstanceManagementMode.API,
      }),
  };

  const databaseService: Partial<ServiceImpl<typeof DatabaseService>> = {
    getDatabase: () =>
      create(GetDatabaseResponseSchema, { database: fixture.database }),
    getDatabaseQueryInsights: () =>
      create(GetDatabaseQueryInsightsResponseSchema, {
        queryInsights: fixture.queryInsights,
      }),
    listDatabases: () =>
      create(ListDatabasesResponseSchema, { databases: fixture.databases }),
  };

  return {
    console,
    database: databaseService,
    extension: {
      listExtensions: () =>
        create(ListExtensionsResponseSchema, {
          extensions: fixture.extensions,
        }),
    } satisfies Partial<ServiceImpl<typeof ExtensionService>>,
    instance,
    metrics: {
      queryMetrics: ({ metrics }) =>
        fixture.metrics
          ? metricsResponse(metrics)
          : create(QueryMetricsResponseSchema),
    } satisfies Partial<ServiceImpl<typeof MetricsService>>,
    schema: {
      listSchemas: () =>
        create(ListSchemasResponseSchema, {
          nextPageToken: fixture.schemasTruncated ? "next" : "",
          schemas: fixture.catalog.schemas,
        }),
    } satisfies Partial<ServiceImpl<typeof SchemaService>>,
    // Other database objects come from streamed SQL; an empty stream means
    // the database has none.
    sql: {
      async *executeQuery() {
        // Yields nothing.
      },
    } satisfies Partial<ServiceImpl<typeof SQLService>>,
    table: {
      listTables: ({ parent }) =>
        create(ListTablesResponseSchema, {
          tables: fixture.catalog.tables[leafId(parent)] ?? [],
        }),
    } satisfies Partial<ServiceImpl<typeof TableService>>,
    view: {
      listViews: ({ parent }) =>
        create(ListViewsResponseSchema, {
          views: fixture.catalog.views[leafId(parent)] ?? [],
        }),
    } satisfies Partial<ServiceImpl<typeof ViewService>>,
  };
}

/** Serves the fixture from a `createTestRouterTransport` router. */
function routeConsoleResources(
  router: ConnectRouter,
  fixture: ConsoleResourceFixture
) {
  const services = consoleResourceServices(fixture);
  router.service(ConsoleService, services.console);
  router.service(DatabaseService, services.database);
  router.service(ExtensionService, services.extension);
  router.service(InstanceService, services.instance);
  router.service(MetricsService, services.metrics);
  router.service(SchemaService, services.schema);
  router.service(SQLService, services.sql);
  router.service(TableService, services.table);
  router.service(ViewService, services.view);
}

export type { CatalogFixture, ConsoleResourceFixture };
export {
  ADMIN_SHELL_FIXTURE,
  busyActivity,
  CONSOLE_DATABASE_ID,
  CONSOLE_FIXED_NOW,
  CONSOLE_INSTANCE_ID,
  catalogSchema,
  catalogTable,
  consoleCatalog,
  consoleInstance,
  consoleResourceFixture,
  consoleResourceServices,
  designExtensions,
  LONG_DATABASE_NAME,
  LONG_INSTANCE_NAME,
  queryInsights,
  routeConsoleResources,
};
