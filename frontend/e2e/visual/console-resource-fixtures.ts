import type { Page, Route } from "playwright/test";
import {
  fulfillJson,
  mockApiManagedReadyConsole,
  mockConfigManagedReadyConsole,
  mockReadyOnboarding,
  mockRpc,
  mockRpcWith,
} from "../tests/helpers";

// Proto3 JSON fixtures for the instance and database console routes. Values
// mirror the rstest fixtures in backend-resource-pages.rstest-browser.test.tsx
// so both runners describe the same server.

const INSTANCE_ID = "production";
const INSTANCE = `instances/${INSTANCE_ID}`;
const DATABASE_ID = "customer-events";
const DATABASE = `${INSTANCE}/databases/${DATABASE_ID}`;
/** Frozen page clock so "Last refreshed" and relative ages stay stable. */
const FIXED_NOW = new Date("2026-05-20T12:00:00Z");
const CONNECT_STREAM_HEADERS = { "Content-Type": "application/connect+json" };
const END_STREAM_FLAG = 0b10;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;

const INSTANCE_URL = `/${INSTANCE}`;
const ACTIVITY_URL = `${INSTANCE_URL}/activity`;
const CONFIGURATION_URL = `${INSTANCE_URL}/configuration`;
const DATABASE_URL = `/${DATABASE}`;
const EXTENSIONS_URL = `${DATABASE_URL}/extensions`;

type Json = Record<string, unknown>;

const instanceFixture: Json = {
  config: {
    database: "postgres",
    host: "analytics-writer.internal.querylane.test",
    port: 5432,
    sslMode: "SSL_MODE_PREFER",
    username: "postgres",
  },
  connectionState: "CONNECTION_STATE_ACTIVE",
  displayName: "Production Analytics Writer",
  labels: { environment: "production", team: "data-platform" },
  name: INSTANCE,
};

const archiveInstanceFixture: Json = {
  ...instanceFixture,
  config: { host: "archive.internal.querylane.test", port: 5432 },
  connectionError: "connection refused",
  connectionState: "CONNECTION_STATE_ERROR",
  displayName: "Archive Instance",
  labels: {},
  name: "instances/archive",
};

const serverInfoFixture: Json = {
  maxConnections: 250,
  replicationRole: "REPLICATION_ROLE_PRIMARY",
  versionNum: 170_004,
  versionShort: "17.4",
};

const overviewFixture: Json = {
  cache: { blocksHit: "987654", blocksRead: "12345", hitRatio: 0.988 },
  connections: {
    activeConnections: 18,
    idleConnections: 56,
    maxConnections: 250,
    totalConnections: 74,
  },
  storage: { totalSizeBytes: "1250000000000" },
};

const databaseFixture: Json = {
  characterSet: "UTF8",
  collation: "en_US.UTF-8",
  displayName: "customer_events",
  isSystemDatabase: false,
  name: DATABASE,
  owner: "data-platform",
};

const databasesFixture: Json[] = [
  databaseFixture,
  {
    characterSet: "UTF8",
    collation: "en_US.UTF-8",
    displayName: "orders",
    isSystemDatabase: false,
    name: `${INSTANCE}/databases/orders`,
    owner: "data-platform",
  },
  {
    characterSet: "UTF8",
    collation: "C",
    displayName: "postgres",
    isSystemDatabase: true,
    name: `${INSTANCE}/databases/postgres`,
    owner: "postgres",
  },
];

function connectionActivity(overrides: Json = {}): Json {
  return {
    activeConnections: 18,
    byApplication: [],
    idleConnections: 54,
    idleInTransactionConnections: 2,
    longestTransactionSeconds: "0",
    longRunningTransactionConnections: 0,
    maxConnections: 100,
    sessions: [],
    status: "HEALTH_CHECK_STATUS_OK",
    summary: "74 connections",
    totalConnections: 74,
    utilizationRatio: 0.74,
    waitingForLockConnections: 0,
    ...overrides,
  };
}

const replicationFixture: Json = {
  attachedReplicas: 2,
  maxReplicationLagBytes: "86000000",
  role: "REPLICATION_ROLE_PRIMARY",
  status: "HEALTH_CHECK_STATUS_OK",
  streamingReplicas: 2,
  summary: "primary with 2 attached replicas",
  synchronousReplicas: 0,
};

function session(fields: Json): Json {
  return { databaseName: "logistics", username: "app_readwrite", ...fields };
}

/** Live sessions with one blocking chain (4211 blocks 4302 and 4318). */
const busyActivityFixture = connectionActivity({
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
  longestTransactionSeconds: "252",
  longRunningTransactionConnections: 1,
  maxConnections: 250,
  sessions: [
    session({
      applicationName: "worker-pool",
      backendAgeSeconds: "7200",
      clientAddress: "10.2.0.7",
      clientPort: 51_234,
      durationSeconds: "252",
      pid: 4211,
      query:
        "UPDATE shipping.shipments SET status = 'in_transit', updated_at = now() WHERE id = $1",
      queryAgeSeconds: "180",
      state: "idle in transaction",
      transactionAgeSeconds: "252",
    }),
    session({
      applicationName: "api-gateway",
      backendAgeSeconds: "3600",
      blockedByPid: 4211,
      clientAddress: "10.2.0.8",
      clientPort: 55_432,
      durationSeconds: "38",
      pid: 4302,
      query: "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
      queryAgeSeconds: "38",
      state: "active",
      transactionAgeSeconds: "38",
      waitEvent: "transactionid",
      waitEventType: "Lock",
    }),
    session({
      applicationName: "api-gateway",
      backendAgeSeconds: "1800",
      blockedByPid: 4211,
      clientAddress: "10.2.0.9",
      clientPort: 50_711,
      durationSeconds: "21",
      pid: 4318,
      query: "SELECT * FROM shipping.shipments WHERE id = $1 FOR UPDATE",
      queryAgeSeconds: "21",
      state: "active",
      transactionAgeSeconds: "21",
      waitEvent: "tuple",
      waitEventType: "Lock",
    }),
    session({
      applicationName: "api-gateway",
      backendAgeSeconds: "60",
      clientAddress: "10.2.0.10",
      clientPort: 49_882,
      durationSeconds: "0",
      pid: 3987,
      query:
        "SELECT s.*, c.name FROM shipping.shipments s JOIN shipping.carriers c ON c.id = s.carrier_id WHERE s.status = ANY($1)",
      queryAgeSeconds: "0",
      state: "active",
    }),
    session({
      applicationName: "metabase",
      backendAgeSeconds: "5400",
      clientAddress: "10.3.1.4",
      clientPort: 60_125,
      databaseName: "billing",
      durationSeconds: "2",
      pid: 4402,
      query:
        "SELECT date_trunc('week', issued_at) AS wk, sum(amount) FROM billing.invoices GROUP BY 1 ORDER BY 1",
      queryAgeSeconds: "2",
      state: "active",
      transactionAgeSeconds: "2",
      username: "analytics_reader",
    }),
  ],
  status: "HEALTH_CHECK_STATUS_WARNING",
  summary: "171 connections",
  totalConnections: 171,
  utilizationRatio: 0.684,
  waitingForLockConnections: 3,
});

function extension(
  displayName: string,
  fields: { comment: string; defaultVersion: string; installedVersion?: string }
): Json {
  return {
    comment: fields.comment,
    defaultVersion: fields.defaultVersion,
    displayName,
    installed: fields.installedVersion !== undefined,
    ...(fields.installedVersion === undefined
      ? {}
      : { installedVersion: fields.installedVersion, schema: "public" }),
    name: `${DATABASE}/extensions/${displayName}`,
  };
}

const designExtensionsFixture: Json[] = [
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

const schemasFixture: Json[] = ["analytics", "public"].map((schemaId) => ({
  displayName: schemaId,
  isSystemSchema: false,
  name: `${DATABASE}/schemas/${schemaId}`,
  owner: "data-platform",
}));

interface CatalogFixture {
  schemas: Json[];
  /** Keyed by schema id. */
  tables: Record<string, Json[]>;
  /** Keyed by schema id. */
  views: Record<string, Json[]>;
}

const tablesBySchema: Record<string, Json[]> = {
  public: [
    {
      displayName: "events",
      name: `${DATABASE}/schemas/public/tables/events`,
      owner: "data-platform",
      rowCount: "1280000",
      sizeBytes: "5368709120",
      tableType: "TABLE_TYPE_BASE_TABLE",
    },
  ],
};

const viewsBySchema: Record<string, Json[]> = {
  analytics: [
    {
      displayName: "daily_rollup",
      isPopulated: true,
      name: `${DATABASE}/schemas/analytics/views/daily_rollup`,
      owner: "data-platform",
      rowCount: "4200",
      sizeBytes: "268435456",
      viewType: "VIEW_TYPE_MATERIALIZED",
    },
  ],
};

const catalogFixture: CatalogFixture = {
  schemas: schemasFixture,
  tables: tablesBySchema,
  views: viewsBySchema,
};

function queryInsightsFixture({
  queryStatsAvailable = true,
  tableStatsAvailable = true,
}: {
  queryStatsAvailable?: boolean;
  tableStatsAvailable?: boolean;
} = {}) {
  return {
    observedAt: FIXED_NOW.toISOString(),
    queryStatsAvailable,
    sequentialScanHotspots: tableStatsAvailable
      ? [
          {
            estimatedLiveRows: "50000",
            indexScans: "3",
            schemaName: "public",
            sequentialScanRatio: 0.8,
            sequentialScans: "12",
            sequentialTuplesRead: "120000",
            tableName: "events",
            totalSizeBytes: "268435456",
          },
        ]
      : [],
    tableCacheHits: tableStatsAvailable
      ? [
          {
            heapBlocksHit: "900",
            heapBlocksRead: "100",
            hitRatio: 0.9,
            schemaName: "public",
            tableName: "events",
            totalSizeBytes: "268435456",
          },
          {
            heapBlocksHit: "500",
            heapBlocksRead: "250",
            hitRatio: 0.67,
            schemaName: "analytics",
            tableName: "daily_rollup_cache",
            totalSizeBytes: "134217728",
          },
        ]
      : [],
    tableStatsAvailable,
    topQueries: queryStatsAvailable
      ? [
          {
            calls: "42",
            meanTimeMs: 20,
            query: "SELECT * FROM events WHERE account_id = $1",
            queryId: "123",
            totalTimeMs: 840,
            totalTimeRatio: 1,
          },
          {
            calls: "8",
            meanTimeMs: 26.25,
            query: "UPDATE events SET processed_at = $1 WHERE id = $2",
            queryId: "456",
            totalTimeMs: 210,
            totalTimeRatio: 0.25,
          },
        ]
      : [],
  };
}

const METRIC_START = Date.parse("2026-05-20T11:00:00Z");
const METRIC_WINDOW_MS = 3_600_000;
const METRIC_STEP = "300s";

/** Space-separated samples keep the five-minute series readable. */
function samples(values: string): number[] {
  return values.split(" ").map(Number);
}

const METRIC_VALUES: Record<string, { unit: string; values: number[] }> = {
  METRIC_ID_CACHE_HIT_RATIO: {
    unit: "METRIC_UNIT_RATIO",
    values: samples(
      "0.982 0.985 0.981 0.988 0.986 0.989 0.987 0.991 0.99 0.988 0.992 0.989 0.991"
    ),
  },
  METRIC_ID_CONNECTIONS_TOTAL: {
    unit: "METRIC_UNIT_COUNT",
    values: samples("68 70 69 72 71 74 73 76 74 75 77 74 74"),
  },
  METRIC_ID_DATABASE_DEAD_TUPLES: {
    unit: "METRIC_UNIT_COUNT",
    values: samples(
      "8100 7900 7600 8300 8800 8600 8200 7800 7500 7300 7100 6900 6700"
    ),
  },
  METRIC_ID_DATABASE_LIVE_TUPLES: {
    unit: "METRIC_UNIT_COUNT",
    values: samples(
      "1220000 1225000 1228000 1232000 1238000 1241000 1245000 1249000 1252000 1257000 1261000 1265000 1270000"
    ),
  },
  METRIC_ID_DATABASE_SIZE_BYTES: {
    unit: "METRIC_UNIT_BYTES",
    values: samples(
      "58900000 59000000 59100000 59300000 59500000 59700000 59900000 60000000 60100000 60200000 60300000 60400000 60500000"
    ),
  },
  METRIC_ID_STORAGE_TOTAL_BYTES: {
    unit: "METRIC_UNIT_BYTES",
    values: samples(
      "1.17e12 1.18e12 1.19e12 1.2e12 1.21e12 1.22e12 1.23e12 1.24e12 1.25e12 1.26e12 1.27e12 1.28e12 1.29e12"
    ),
  },
};

/** Serves the requested metric ids with a steady hour of samples. */
function metricsResponse(request: Json): Json {
  const requested = Array.isArray(request["metrics"]) ? request["metrics"] : [];
  const startTime = new Date(METRIC_START).toISOString();
  return {
    interval: {
      endTime: new Date(METRIC_START + METRIC_WINDOW_MS).toISOString(),
      startTime,
    },
    series: requested.flatMap((metric) => {
      const series = typeof metric === "string" ? METRIC_VALUES[metric] : null;
      if (!series) {
        return [];
      }
      return [
        {
          delta: {
            currentValue: series.values.at(-1) ?? 0,
            percentChange: 4.2,
            previousAvailable: false,
          },
          kind: "METRIC_KIND_GAUGE",
          metric,
          points: {
            startTime,
            step: METRIC_STEP,
            values: series.values,
          },
          unit: series.unit,
        },
      ];
    }),
  };
}

// Minimal protobuf wire encoding for `google.rpc` error details, which the
// Connect JSON protocol carries as base64 binary messages.
const VARINT_CONTINUATION = 0x80;
const FIELD_NUMBER_MULTIPLIER = 8;
const LENGTH_DELIMITED_WIRE_TYPE = 2;
const CONNECT_ENVELOPE_HEADER_BYTES = 5;

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= VARINT_CONTINUATION) {
    bytes.push((remaining % VARINT_CONTINUATION) + VARINT_CONTINUATION);
    remaining = Math.floor(remaining / VARINT_CONTINUATION);
  }
  bytes.push(remaining);
  return bytes;
}

function encodeBytesField(fieldNumber: number, payload: number[]): number[] {
  return [
    ...encodeVarint(
      fieldNumber * FIELD_NUMBER_MULTIPLIER + LENGTH_DELIMITED_WIRE_TYPE
    ),
    ...encodeVarint(payload.length),
    ...payload,
  ];
}

function encodeStringField(fieldNumber: number, text: string): number[] {
  return encodeBytesField(fieldNumber, [...Buffer.from(text, "utf8")]);
}

function errorInfoDetail(reason: string, domain: string): Json {
  return {
    debug: { domain, reason },
    type: "google.rpc.ErrorInfo",
    value: Buffer.from([
      ...encodeStringField(1, reason),
      ...encodeStringField(2, domain),
    ]).toString("base64"),
  };
}

function badRequestDetail(field: string, description: string): Json {
  const violation = [
    ...encodeStringField(1, field),
    ...encodeStringField(2, description),
  ];
  return {
    debug: { fieldViolations: [{ description, field }] },
    type: "google.rpc.BadRequest",
    value: Buffer.from(encodeBytesField(1, violation)).toString("base64"),
  };
}

async function routeRpc(
  page: Page,
  method: string,
  handler: (route: Route) => Promise<void>
) {
  await page.route(`**/${method}`, handler);
  await page.route(`**.${method}`, handler);
}

/** A Connect server stream that ends immediately with no messages. */
async function mockEmptyServerStream(page: Page, method: string) {
  const endStream = Buffer.from("{}");
  const envelope = Buffer.alloc(
    CONNECT_ENVELOPE_HEADER_BYTES + endStream.length
  );
  envelope.writeUInt8(END_STREAM_FLAG, 0);
  envelope.writeUInt32BE(endStream.length, 1);
  endStream.copy(envelope, CONNECT_ENVELOPE_HEADER_BYTES);
  await routeRpc(page, method, (route) =>
    route.fulfill({ body: envelope, headers: CONNECT_STREAM_HEADERS })
  );
}

function leafId(resourceName: unknown) {
  return typeof resourceName === "string"
    ? (resourceName.split("/").at(-1) ?? "")
    : "";
}

interface ConsoleShellOptions {
  activity?: Json | null;
  catalog?: CatalogFixture;
  configManaged?: boolean;
  database?: Json;
  databases?: Json[];
  /** The meta database is down, so the shell runs in degraded mode. */
  degraded?: boolean;
  extensions?: Json[];
  instance?: Json;
  metrics?: boolean;
  queryInsights?: Json | null;
  schemasTruncated?: boolean;
}

/**
 * Mocks every RPC the instance and database console routes issue, with the
 * clock frozen so refresh times and relative ages render identically.
 */
async function mockConsoleResources(
  page: Page,
  {
    activity = connectionActivity(),
    catalog = catalogFixture,
    configManaged = false,
    database = databaseFixture,
    databases = databasesFixture,
    degraded = false,
    extensions = [
      extension("pg_stat_statements", {
        comment: "",
        defaultVersion: "1.10",
        installedVersion: "1.10",
      }),
    ],
    instance = instanceFixture,
    metrics = false,
    queryInsights = null,
    schemasTruncated = false,
  }: ConsoleShellOptions = {}
) {
  await page.clock.setFixedTime(FIXED_NOW);
  // Header star count comes from GitHub; keep it off the network.
  await page.route("https://api.github.com/**", (route) =>
    fulfillJson(route, { stargazers_count: 1200 })
  );
  await (degraded
    ? mockRpc(page, "OnboardingService/GetOnboardingState", {
        appDatabaseStatus: { schemaVersion: 1, state: "STATE_ERROR" },
        availableMethods: [],
        configFilePath: "/tmp/querylane/config.yaml",
        homePath: "/tmp/querylane",
        isConfigured: true,
        isHomeWritable: true,
      })
    : mockReadyOnboarding(page));
  await (configManaged
    ? mockConfigManagedReadyConsole(page)
    : mockApiManagedReadyConsole(page));
  // A second instance keeps delete enabled: the last instance cannot go.
  await mockRpc(page, "InstanceService/ListInstances", {
    instances: [instance, archiveInstanceFixture],
    nextPageToken: "",
  });
  await mockRpc(page, "InstanceService/GetInstance", {
    instance,
    serverInfo: serverInfoFixture,
  });
  await mockRpc(page, "InstanceService/GetInstanceOverview", {
    instanceOverview: overviewFixture,
  });
  await mockRpc(page, "InstanceService/CheckInstanceHealth", {
    health: {
      connectionActivity: connectionActivity(),
      replication: replicationFixture,
    },
  });
  await mockRpc(
    page,
    "InstanceService/CheckInstanceActivity",
    activity
      ? { activity }
      : {
          partialErrors: [
            { code: 7, message: "permission denied for pg_stat_activity" },
          ],
        }
  );
  await mockRpcWith(page, "MetricsService/QueryMetrics", (request) =>
    metrics ? metricsResponse(request) : { series: [] }
  );
  await mockRpc(page, "DatabaseService/ListDatabases", {
    databases,
    nextPageToken: "",
  });
  await mockRpc(page, "DatabaseService/GetDatabase", { database });
  await mockRpc(page, "DatabaseService/GetDatabaseQueryInsights", {
    queryInsights: queryInsights ?? {
      observedAt: FIXED_NOW.toISOString(),
      queryStatsAvailable: false,
      tableStatsAvailable: false,
    },
  });
  await mockRpc(page, "ExtensionService/ListExtensions", {
    extensions,
    nextPageToken: "",
  });
  await mockRpc(page, "SchemaService/ListSchemas", {
    nextPageToken: schemasTruncated ? "next" : "",
    schemas: catalog.schemas,
  });
  await mockRpcWith(page, "TableService/ListTables", (request) => ({
    nextPageToken: "",
    tables: catalog.tables[leafId(request["parent"])] ?? [],
  }));
  await mockRpcWith(page, "ViewService/ListViews", (request) => ({
    nextPageToken: "",
    views: catalog.views[leafId(request["parent"])] ?? [],
  }));
  await mockEmptyServerStream(page, "SQLService/ExecuteQuery");
}

/** Every later instance and overview load fails with a meta database outage. */
async function failInstanceLoadsWithMetaDatabaseOutage(page: Page) {
  const body = {
    code: "unavailable",
    details: [
      errorInfoDetail(
        "ERROR_REASON_APP_DATABASE_UNAVAILABLE",
        "console.querylane.dev"
      ),
    ],
    message: "meta database is unavailable",
  };
  await Promise.all(
    ["InstanceService/GetInstance", "InstanceService/GetInstanceOverview"].map(
      (method) =>
        routeRpc(page, method, (route) =>
          fulfillJson(route, body, HTTP_SERVICE_UNAVAILABLE)
        )
    )
  );
}

/** Rejects the next instance update with a password field violation. */
async function rejectInstancePassword(page: Page, description: string) {
  await routeRpc(page, "InstanceService/UpdateInstance", (route) =>
    fulfillJson(
      route,
      {
        code: "invalid_argument",
        details: [badRequestDetail("instance.config.password", description)],
        message: description,
      },
      HTTP_BAD_REQUEST
    )
  );
}

export type { CatalogFixture };
export {
  ACTIVITY_URL,
  archiveInstanceFixture,
  busyActivityFixture,
  CONFIGURATION_URL,
  connectionActivity,
  DATABASE_URL,
  databaseFixture,
  designExtensionsFixture,
  EXTENSIONS_URL,
  failInstanceLoadsWithMetaDatabaseOutage,
  INSTANCE_URL,
  instanceFixture,
  mockConsoleResources,
  queryInsightsFixture,
  rejectInstancePassword,
};
