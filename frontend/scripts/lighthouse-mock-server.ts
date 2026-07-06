#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { join, normalize, resolve, sep } from "node:path";
import { env } from "node:process";
import { brotliCompressSync, gzipSync } from "node:zlib";

const DEFAULT_PORT = 4173;
const FRONTEND_ROOT = join(import.meta.dirname, "..");
const DEFAULT_DIST_DIR = join(FRONTEND_ROOT, "dist");
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const ONE_YEAR_CACHE_SECONDS = 31_536_000;
const IMMUTABLE_STATIC_CACHE_CONTROL = `public, max-age=${ONE_YEAR_CACHE_SECONDS}, immutable`;
const NO_CACHE_CONTROL = "no-cache";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const LEADING_SLASH_PATTERN = /^[/\\]+/;
const COMPRESSIBLE_CONTENT_TYPE_PREFIXES = [
  "application/json",
  "image/svg+xml",
  "text/",
];

interface StaticBodyCacheEntry {
  brotliBody?: Buffer | undefined;
  gzipBody?: Buffer | undefined;
  sourceBody: Buffer;
}

const staticBodyCache = new Map<string, StaticBodyCacheEntry>();

const sampleInstance = {
  config: {
    database: "postgres",
    host: "db.local",
    password: "secret",
    port: 5432,
    sslMode: "SSL_MODE_REQUIRE",
    username: "postgres",
  },
  connectionState: "CONNECTION_STATE_ACTIVE",
  displayName: "Production Postgres",
  labels: { env: "prod" },
  name: "instances/production",
};

const sampleDatabase = {
  characterSet: "UTF8",
  collation: "en_US.UTF-8",
  displayName: "appdb",
  isSystemDatabase: false,
  name: "instances/production/databases/appdb",
  owner: "app_owner",
};

const schemaRows = [
  {
    displayName: "public",
    isSystemSchema: false,
    name: "instances/production/databases/appdb/schemas/public",
    owner: "app_owner",
  },
  {
    displayName: "billing",
    isSystemSchema: false,
    name: "instances/production/databases/appdb/schemas/billing",
    owner: "billing_owner",
  },
];

const ordersTable = {
  displayName: "orders",
  name: "instances/production/databases/appdb/schemas/public/tables/orders",
  rowCount: "25",
  sizeBytes: "4096",
  tableType: "TABLE_TYPE_BASE_TABLE",
};

const orderColumns = [
  {
    columnName: "id",
    dataType: "DATA_TYPE_INTEGER",
    isNullable: false,
    isPrimaryKey: true,
    mayTruncate: false,
    rawType: "integer",
  },
  {
    columnName: "email",
    dataType: "DATA_TYPE_STRING",
    isNullable: false,
    mayTruncate: false,
    rawType: "text",
  },
  {
    columnName: "payload",
    dataType: "DATA_TYPE_JSON",
    isNullable: true,
    mayTruncate: true,
    rawType: "jsonb",
  },
];

const orderIndexes = [
  {
    includedColumns: [],
    indexName: "orders_pkey",
    isPrimary: true,
    isUnique: true,
    keyColumns: ["id"],
    method: "btree",
    sizeBytes: "16384",
  },
  {
    includedColumns: [],
    indexName: "orders_email_idx",
    isPrimary: false,
    isUnique: false,
    keyColumns: ["email"],
    method: "btree",
    sizeBytes: "8192",
  },
];

const orderConstraints = [
  {
    columnNames: ["id"],
    constraintName: "orders_pkey",
    definition: "PRIMARY KEY (id)",
    referencedColumnNames: [],
    referencedTable: "",
    type: "CONSTRAINT_TYPE_PRIMARY_KEY",
  },
];

const orderPolicies = [
  {
    checkExpression: "customer_id = current_setting('app.customer_id')::int",
    command: "POLICY_COMMAND_SELECT",
    mode: "POLICY_MODE_PERMISSIVE",
    policyName: "orders_customer_read_policy",
    roles: ["app_reader"],
    usingExpression: "customer_id = current_setting('app.customer_id')::int",
  },
];

const orderTriggers = [
  {
    enabled: true,
    events: ["INSERT", "UPDATE"],
    functionName: "audit_orders",
    timing: "AFTER",
    triggerName: "orders_audit_trigger",
  },
];

const LIGHTHOUSE_MOCK_RESPONSES = {
  "ConsoleService/GetConsoleConfig": {
    databaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    instanceManagementMode: "INSTANCE_MANAGEMENT_MODE_API",
  },
  "DatabaseService/GetDatabase": { database: sampleDatabase },
  "DatabaseService/ListDatabases": {
    databases: [sampleDatabase],
    nextPageToken: "",
  },
  "InstanceService/GetInstance": {
    instance: sampleInstance,
    serverInfo: {
      maxConnections: 100,
      replicationRole: "REPLICATION_ROLE_PRIMARY",
      version: "PostgreSQL 16.3",
      versionNum: 160_003,
      versionShort: "16.3",
    },
  },
  "InstanceService/GetInstanceOverview": {
    instanceOverview: {
      cache: { hitRatio: 0.97 },
      connections: { maxConnections: 100, totalConnections: 12 },
      storage: { totalSizeBytes: "104857600" },
    },
  },
  "InstanceService/ListInstances": {
    instances: [sampleInstance],
    nextPageToken: "",
  },
  "OnboardingService/GetOnboardingState": {
    appDatabaseStatus: { schemaVersion: 1, state: "STATE_READY" },
    availableMethods: [],
    configFilePath: "/tmp/querylane/config.yaml",
    homePath: "/tmp/querylane",
    isConfigured: true,
    isHomeWritable: true,
  },
  "SchemaService/GetSchema": { schema: schemaRows[0] },
  "SchemaService/ListSchemas": {
    nextPageToken: "",
    schemas: schemaRows,
  },
  "TableDataService/ReadRows": {
    nextPageToken: "",
    resultSet: {
      columns: orderColumns,
      observedAt: "2026-05-20T10:00:00Z",
      paginationStrategy: "PAGINATION_STRATEGY_KEYSET",
      rowCount: { status: "STATUS_AVAILABLE", value: "2" },
      rowIdentity: { columnNames: ["id"], source: "SOURCE_PRIMARY_KEY" },
      rows: [
        {
          rowKey: "orders/1",
          values: [
            { value: { int64Value: "1" } },
            { value: { stringValue: "ada@example.com" } },
            { value: { jsonValue: '{"preview":true}' } },
          ],
        },
        {
          rowKey: "orders/2",
          values: [
            { value: { int64Value: "2" } },
            { value: { stringValue: "grace@example.com" } },
            { value: { jsonValue: '{"preview":false}' } },
          ],
        },
      ],
    },
  },
  "TableService/GetTable": { table: ordersTable },
  "TableService/GetTablePartitionMetadata": {
    partitionMetadata: {
      childPartitions: [],
      parentTable: "",
      partitionBound: "",
      partitionCount: 0,
      partitionKey: "",
    },
  },
  "TableService/ListTableColumns": { columns: orderColumns },
  "TableService/ListTableConstraints": { constraints: orderConstraints },
  "TableService/ListTableIndexes": { indexes: orderIndexes },
  "TableService/ListTablePolicies": { policies: orderPolicies },
  "TableService/ListTables": {
    nextPageToken: "",
    tables: [ordersTable],
  },
  "TableService/ListTableTriggers": { triggers: orderTriggers },
  "ViewService/GetView": {
    view: {
      comment: "Customers with an active subscription",
      displayName: "active_accounts",
      name: "instances/production/databases/appdb/schemas/public/views/active_accounts",
      owner: "analytics_owner",
      viewType: "VIEW_TYPE_STANDARD",
    },
  },
  "ViewService/ListViews": { nextPageToken: "", views: [] },
} as const;

const MOCK_RPC_PATH_SEGMENT_COUNT = 2;
const serializedMockResponses = new Map(
  Object.entries(LIGHTHOUSE_MOCK_RESPONSES).map(
    ([method, body]) => [method, JSON.stringify(body)] as const
  )
);

function findLighthouseMockBody(url: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return;
  }

  const [servicePath, methodName] = pathname
    .split("/")
    .filter(Boolean)
    .slice(-MOCK_RPC_PATH_SEGMENT_COUNT);
  if (!(servicePath && methodName)) {
    return;
  }

  const serviceName = servicePath.split(".").at(-1);
  if (!serviceName) {
    return;
  }

  return serializedMockResponses.get(`${serviceName}/${methodName}`);
}

function createLighthouseMockResponse(request: Request): Response | undefined {
  if (request.method !== "POST") {
    return;
  }

  const body = findLighthouseMockBody(request.url);
  if (body === undefined) {
    return;
  }

  return new Response(body, { headers: JSON_HEADERS });
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml; charset=utf-8";
  }
  if (filePath.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }
  if (filePath.endsWith(".woff2")) {
    return "font/woff2";
  }
  return "application/octet-stream";
}

function resolveDistFilePath(distDir: string, pathname: string): string | null {
  const decodedPathname = decodeURIComponent(pathname);
  const normalizedPathname = normalize(decodedPathname).replace(
    LEADING_SLASH_PATTERN,
    ""
  );
  const relativePath = normalizedPathname || "index.html";
  const resolvedDistDir = resolve(distDir);
  const filePath = resolve(resolvedDistDir, relativePath);
  const insideDistDir =
    filePath === resolvedDistDir ||
    filePath.startsWith(`${resolvedDistDir}${sep}`);

  return insideDistDir ? filePath : null;
}

function shouldServeSpaFallback(request: Request) {
  if (!(request.method === "GET" || request.method === "HEAD")) {
    return false;
  }

  const acceptHeader = request.headers.get("accept") ?? "";
  const pathname = new URL(request.url).pathname;
  return acceptHeader.includes("text/html") || !pathname.includes(".");
}

function acceptsContentEncoding(request: Request, encoding: "br" | "gzip") {
  const acceptEncoding = request.headers.get("accept-encoding") ?? "";
  return acceptEncoding
    .split(",")
    .some((value) => value.trim().toLowerCase().split(";").at(0) === encoding);
}

function isCompressibleContentType(contentType: string) {
  const normalizedContentType = contentType.toLowerCase();
  return COMPRESSIBLE_CONTENT_TYPE_PREFIXES.some((prefix) =>
    normalizedContentType.startsWith(prefix)
  );
}

function createStaticBodyCacheEntry(filePath: string): StaticBodyCacheEntry {
  const sourceBody = readFileSync(filePath);
  if (!isCompressibleContentType(contentTypeFor(filePath))) {
    return { sourceBody };
  }

  return {
    brotliBody: brotliCompressSync(sourceBody),
    gzipBody: gzipSync(sourceBody),
    sourceBody,
  };
}

function getStaticBodyCacheEntry(filePath: string) {
  const cachedEntry = staticBodyCache.get(filePath);
  if (cachedEntry) {
    return cachedEntry;
  }

  const entry = createStaticBodyCacheEntry(filePath);
  staticBodyCache.set(filePath, entry);
  return entry;
}

function encodedStaticBody({
  filePath,
  request,
}: {
  filePath: string;
  request: Request;
}) {
  const entry = getStaticBodyCacheEntry(filePath);

  if (acceptsContentEncoding(request, "br") && entry.brotliBody) {
    return {
      body: entry.brotliBody,
      contentEncoding: "br" as const,
    };
  }

  if (acceptsContentEncoding(request, "gzip") && entry.gzipBody) {
    return {
      body: entry.gzipBody,
      contentEncoding: "gzip" as const,
    };
  }

  return { body: entry.sourceBody, contentEncoding: null };
}

function responseBodyInit(body: Buffer): ArrayBuffer {
  const copy = new Uint8Array(body.byteLength);
  copy.set(body);
  return copy.buffer;
}

function cacheControlForPathname(pathname: string) {
  return pathname.startsWith("/static/")
    ? IMMUTABLE_STATIC_CACHE_CONTROL
    : NO_CACHE_CONTROL;
}

function createStaticFileResponse({
  cachePathname,
  filePath,
  request,
}: {
  cachePathname: string;
  filePath: string;
  request: Request;
}) {
  const contentType = contentTypeFor(filePath);
  const { body, contentEncoding } = encodedStaticBody({
    filePath,
    request,
  });
  const headers = new Headers({
    "Cache-Control": cacheControlForPathname(cachePathname),
    "Content-Length": String(body.byteLength),
    "Content-Type": contentType,
  });

  if (contentEncoding) {
    headers.set("Content-Encoding", contentEncoding);
    headers.set("Vary", "Accept-Encoding");
  }

  return new Response(
    request.method === "HEAD" ? null : responseBodyInit(body),
    { headers }
  );
}

function createStaticResponse(
  request: Request,
  distDir = DEFAULT_DIST_DIR
): Response | undefined {
  if (!(request.method === "GET" || request.method === "HEAD")) {
    return;
  }

  const pathname = new URL(request.url).pathname;
  const filePath = resolveDistFilePath(distDir, pathname);
  if (filePath && existsSync(filePath)) {
    return createStaticFileResponse({
      cachePathname: pathname,
      filePath,
      request,
    });
  }

  if (!shouldServeSpaFallback(request)) {
    return;
  }

  const indexPath = join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    return;
  }

  return createStaticFileResponse({
    cachePathname: "/index.html",
    filePath: indexPath,
    request,
  });
}

function handleLighthouseRequest(
  request: Request,
  distDir = DEFAULT_DIST_DIR
): Response {
  const mockResponse = createLighthouseMockResponse(request);
  if (mockResponse) {
    return mockResponse;
  }

  const staticResponse = createStaticResponse(request, distDir);
  if (staticResponse) {
    return staticResponse;
  }

  return new Response(
    JSON.stringify({
      code: "not_found",
      message: "No Lighthouse mock matched.",
    }),
    { headers: JSON_HEADERS, status: HTTP_NOT_FOUND }
  );
}

function primeStaticResponseCache(distDir = DEFAULT_DIST_DIR) {
  if (!existsSync(distDir)) {
    return;
  }

  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    const entryPath = join(distDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "lighthouse") {
        continue;
      }
      primeStaticResponseCache(entryPath);
      continue;
    }
    if (entry.isFile()) {
      getStaticBodyCacheEntry(entryPath);
    }
  }
}

function readPort() {
  const rawPort = env["PORT"]?.trim();
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(rawPort, 10);
  return Number.isFinite(port) ? port : DEFAULT_PORT;
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        requestHeaders.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      requestHeaders.set(key, value);
    }
  }
  return requestHeaders;
}

function startLighthouseMockServer() {
  const port = readPort();
  const hostname = "127.0.0.1";
  primeStaticResponseCache();
  const server = createServer(async (incomingRequest, outgoingResponse) => {
    try {
      incomingRequest.resume();
      const host = incomingRequest.headers.host ?? `${hostname}:${port}`;
      const request = new Request(
        `http://${host}${incomingRequest.url ?? "/"}`,
        {
          headers: headersFromIncoming(incomingRequest.headers),
          method: incomingRequest.method ?? "GET",
        }
      );

      const response = handleLighthouseRequest(request);
      const body = await response.arrayBuffer();
      outgoingResponse.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries())
      );
      outgoingResponse.end(Buffer.from(body));
    } catch (error: unknown) {
      outgoingResponse.writeHead(HTTP_INTERNAL_SERVER_ERROR, {
        "Content-Type": "text/plain",
      });
      outgoingResponse.end(error instanceof Error ? error.message : "Error");
    }
  });

  server.listen(port, hostname, () => {
    console.log(`Lighthouse mock server ready on http://${hostname}:${port}`);
  });
  return server;
}

if (import.meta.main) {
  startLighthouseMockServer();
}

export {
  createLighthouseMockResponse,
  findLighthouseMockBody,
  handleLighthouseRequest,
  LIGHTHOUSE_MOCK_RESPONSES,
  startLighthouseMockServer,
};
