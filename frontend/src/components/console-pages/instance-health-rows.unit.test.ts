import { create as createProto } from "@bufbuild/protobuf";
import { anyPack, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, test } from "vitest";
import {
  buildConnectedEndpointRow,
  buildDisconnectedDiagnosticRows,
  buildInstanceFacts,
  buildLiveHealthRows,
  getHealthCheckPartialReasons,
  toneFromHealthCheckStatus,
} from "@/components/console-pages/instance-health-rows";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import { StatusSchema } from "@/protogen/google/rpc/status_pb";
import {
  AutovacuumHealthSchema,
  ConnectionActivityHealthSchema,
  HealthCheckStatus,
  InstanceHealthSchema,
  InstanceSchema,
  PgStatStatementsHealthSchema,
  PostgresConfig_SslMode,
  PostgresConfigSchema,
  ReplicationHealthSchema,
  ServerInfo_ReplicationRole,
  ServerInfoSchema,
  StatsAccessHealthSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const TEST_NUMBER_18 = 18;
const TEST_NUMBER_90 = 90;

const MS_PER_MINUTE = 60_000;
const UPTIME_FACT_PATTERN = /^up /;

function instanceFixture(sslMode = PostgresConfig_SslMode.PREFER) {
  return createProto(InstanceSchema, {
    config: createProto(PostgresConfigSchema, {
      database: "postgres",
      host: "db.internal",
      port: 5432,
      sslMode,
      username: "postgres",
    }),
    displayName: "Production",
    name: "instances/prod",
  });
}

describe("toneFromHealthCheckStatus", () => {
  test("maps statuses to tones", () => {
    expect(toneFromHealthCheckStatus(HealthCheckStatus.OK)).toBe("ok");
    expect(toneFromHealthCheckStatus(HealthCheckStatus.WARNING)).toBe(
      "warning"
    );
    expect(toneFromHealthCheckStatus(HealthCheckStatus.ERROR)).toBe("error");
    expect(toneFromHealthCheckStatus(HealthCheckStatus.UNKNOWN)).toBe("muted");
    expect(toneFromHealthCheckStatus(HealthCheckStatus.NOT_APPLICABLE)).toBe(
      "muted"
    );
    expect(toneFromHealthCheckStatus(HealthCheckStatus.UNSPECIFIED)).toBe(
      "muted"
    );
  });
});

describe("getHealthCheckPartialReasons", () => {
  test("maps partial errors to categories via ErrorInfo metadata", () => {
    const partialError = createProto(StatusSchema, {
      details: [
        anyPack(
          ErrorInfoSchema,
          createProto(ErrorInfoSchema, {
            metadata: { check: "stats_access" },
            reason: "STATS_ACCESS_DENIED",
          })
        ),
      ],
      message: "permission denied for view pg_stat_activity",
    });

    expect(getHealthCheckPartialReasons([partialError])).toEqual({
      stats_access: "permission denied for view pg_stat_activity",
    });
  });

  test("ignores errors without a known check key", () => {
    const partialError = createProto(StatusSchema, {
      details: [
        anyPack(
          ErrorInfoSchema,
          createProto(ErrorInfoSchema, { metadata: { check: "bogus" } })
        ),
      ],
      message: "whatever",
    });

    expect(getHealthCheckPartialReasons([partialError])).toEqual({});
    expect(getHealthCheckPartialReasons(undefined)).toEqual({});
  });
});

describe("buildLiveHealthRows", () => {
  test("composes a connections summary from activity fields", () => {
    const health = createProto(InstanceHealthSchema, {
      connectionActivity: createProto(ConnectionActivityHealthSchema, {
        activeConnections: 3,
        idleConnections: 39,
        maxConnections: 100,
        status: HealthCheckStatus.OK,
        totalConnections: 42,
        utilizationRatio: 0.42,
        waitingForLockConnections: 0,
      }),
    });

    const rows = buildLiveHealthRows(health, undefined);
    const connections = rows.find((row) => row.id === "connections");

    expect(connections?.summary).toBe("42% used · 3 active · no lock waits");
    expect(connections?.tone).toBe("ok");
    expect(connections?.detail).toContainEqual({
      label: "Total connections",
      value: "42 of 100",
    });
  });

  test("mentions lock waiters when present", () => {
    const health = createProto(InstanceHealthSchema, {
      connectionActivity: createProto(ConnectionActivityHealthSchema, {
        activeConnections: 5,
        status: HealthCheckStatus.WARNING,
        utilizationRatio: 0.9,
        waitingForLockConnections: 2,
      }),
    });

    const rows = buildLiveHealthRows(health, undefined);
    const connections = rows.find((row) => row.id === "connections");

    expect(connections?.summary).toBe(
      "90% used · 5 active · 2 waiting on locks"
    );
    expect(connections?.tone).toBe("warning");
  });

  test("prefers backend summaries and includes autovacuum detail", () => {
    const lastRun = timestampFromDate(
      new Date(Date.now() - TEST_NUMBER_18 * MS_PER_MINUTE)
    );
    const health = createProto(InstanceHealthSchema, {
      autovacuum: createProto(AutovacuumHealthSchema, {
        lastAutovacuumAt: lastRun,
        maxWorkers: 3,
        runningWorkers: 1,
        status: HealthCheckStatus.OK,
        summary: "1 of 3 workers · last ran 18m ago",
      }),
      pgStatStatements: createProto(PgStatStatementsHealthSchema, {
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
    });

    const rows = buildLiveHealthRows(health, undefined);

    expect(rows.map((row) => row.id)).toEqual([
      "connections",
      "replication",
      "stats-access",
      "pg-stat-statements",
      "autovacuum",
    ]);
    expect(rows.find((row) => row.id === "replication")?.summary).toBe(
      "Primary · 1 replica streaming"
    );
    expect(rows.find((row) => row.id === "stats-access")?.summary).toBe(
      "superuser · full visibility"
    );
    expect(rows.find((row) => row.id === "pg-stat-statements")?.tone).toBe(
      "warning"
    );
    const autovacuum = rows.find((row) => row.id === "autovacuum");
    expect(autovacuum?.detail).toContainEqual({
      label: "Running workers",
      value: "1 of 3",
    });
    expect(autovacuum?.detail).toContainEqual({
      label: "Last autovacuum",
      value: "18m ago",
    });
  });

  test("renders a missing category as a muted row with the partial-error reason", () => {
    const partialError = createProto(StatusSchema, {
      details: [
        anyPack(
          ErrorInfoSchema,
          createProto(ErrorInfoSchema, { metadata: { check: "autovacuum" } })
        ),
      ],
      message: "autovacuum check timed out",
    });

    const rows = buildLiveHealthRows(createProto(InstanceHealthSchema, {}), [
      partialError,
    ]);
    const autovacuum = rows.find((row) => row.id === "autovacuum");

    expect(autovacuum?.tone).toBe("muted");
    expect(autovacuum?.summary).toBe("autovacuum check timed out");
  });

  test("renders a missing category without a reason as no-data", () => {
    const rows = buildLiveHealthRows(undefined, undefined);

    for (const row of rows) {
      expect(row.tone).toBe("muted");
      expect(row.summary).toBe("No data");
    }
  });
});

describe("buildConnectedEndpointRow", () => {
  test("folds endpoint, tls, and auth into one summary", () => {
    const row = buildConnectedEndpointRow(instanceFixture());

    expect(row.tone).toBe("ok");
    expect(row.summary).toBe(
      "db.internal:5432 · TLS prefer · credentials accepted"
    );
  });

  test("keeps the plaintext warning when TLS is disabled", () => {
    const row = buildConnectedEndpointRow(
      instanceFixture(PostgresConfig_SslMode.DISABLED)
    );

    expect(row.tone).toBe("warning");
    expect(row.summary).toBe(
      "db.internal:5432 · TLS disabled (plaintext) · credentials accepted"
    );
  });
});

describe("buildDisconnectedDiagnosticRows", () => {
  test("shows not-checked diagnostics while disconnected", () => {
    const rows = buildDisconnectedDiagnosticRows({
      connectionStatus: "disconnected",
      instance: instanceFixture(),
    });

    expect(rows.map((row) => row.id)).toEqual(["tcp", "authentication", "tls"]);
    expect(rows[0]?.tone).toBe("muted");
    expect(rows[0]?.summary).toBe("Not checked yet");
    expect(rows[2]?.summary).toBe("prefer · may fall back to plaintext");
  });

  test("surfaces the connection error on failure", () => {
    const instance = instanceFixture();
    instance.connectionError = "connection refused";
    const rows = buildDisconnectedDiagnosticRows({
      connectionStatus: "error",
      instance,
    });

    expect(rows[0]?.tone).toBe("error");
    expect(rows[0]?.summary).toBe("connection refused");
    expect(rows[1]?.tone).toBe("error");
  });

  test("flags disabled tls as a warning", () => {
    const rows = buildDisconnectedDiagnosticRows({
      connectionStatus: "disconnected",
      instance: instanceFixture(PostgresConfig_SslMode.DISABLED),
    });
    const tls = rows.find((row) => row.id === "tls");

    expect(tls?.tone).toBe("warning");
    expect(tls?.summary).toBe("Disabled in the saved configuration");
  });
});

describe("buildInstanceFacts", () => {
  test("builds version, uptime, platform, extension, and limit facts", () => {
    const serverInfo = createProto(ServerInfoSchema, {
      maxConnections: 100,
      startedAt: timestampFromDate(
        new Date(Date.now() - TEST_NUMBER_90 * MS_PER_MINUTE)
      ),
      version:
        "PostgreSQL 17.9 on aarch64-unknown-linux-musl, compiled by gcc, 64-bit",
      versionShort: "17.9",
    });

    const facts = buildInstanceFacts({
      extensionsInstalledCount: 6,
      serverInfo,
    });

    expect(facts[0]).toBe("PostgreSQL 17.9");
    expect(facts[1]).toMatch(UPTIME_FACT_PATTERN);
    expect(facts).toContain("aarch64 / linux");
    expect(facts).toContain("6 extensions");
    expect(facts).toContain("max 100 connections");
  });

  test("omits unavailable facts instead of rendering placeholders", () => {
    const serverInfo = createProto(ServerInfoSchema, {
      version: "PostgreSQL 16.1, compiled by Visual C++ build 1937, 64-bit",
      versionShort: "16.1",
    });

    expect(
      buildInstanceFacts({ extensionsInstalledCount: undefined, serverInfo })
    ).toEqual(["PostgreSQL 16.1"]);
    expect(
      buildInstanceFacts({ extensionsInstalledCount: 3, serverInfo: undefined })
    ).toEqual([]);
  });

  test("uses singular wording for one extension", () => {
    const serverInfo = createProto(ServerInfoSchema, { versionShort: "17.0" });

    expect(
      buildInstanceFacts({ extensionsInstalledCount: 1, serverInfo })
    ).toContain("1 extension");
  });
});
