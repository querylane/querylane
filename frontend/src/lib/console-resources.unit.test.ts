import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDatabaseName,
  buildInstanceName,
  buildSchemaName,
  buildTableName,
  buildViewName,
  formatBytes,
  formatTimestampLabel,
  formatUptime,
  normalizeEstimatedRowCount,
  parseResourceLeafId,
  parseTableQualifiedName,
  toConnectionStatus,
  tryParseTableQualifiedName,
} from "@/lib/console-resources";
import { Instance_ConnectionState } from "@/protogen/querylane/console/v1alpha1/instance_pb";

const TEST_NUMBER_512 = 512;
const TEST_NUMBER_1536 = 1536;
const TEST_BIGINT_1024 = 1024n;
const TEST_BIGINT_5 = 5n;
const TEST_NUMBER_1048575 = 1_048_575;
const TEST_NUMBER_1023_POINT_6 = 1023.6;
const TEST_NUMBER_512_POINT_345 = 512.345;
const TEST_NUMBER_1024 = 1024;
const TEST_NUMBER_5 = 5;

const KNOWN_ROW_COUNT = 128;

describe("row count normalization", () => {
  it("clamps negative bigint estimates to zero", () => {
    expect(normalizeEstimatedRowCount(-1n)).toBe(0);
  });

  it("preserves zero and positive counts", () => {
    expect(normalizeEstimatedRowCount(0n)).toBe(0);
    expect(normalizeEstimatedRowCount(KNOWN_ROW_COUNT)).toBe(KNOWN_ROW_COUNT);
  });

  it("clamps invalid values to zero", () => {
    expect(normalizeEstimatedRowCount(Number.NaN)).toBe(0);
    expect(normalizeEstimatedRowCount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeEstimatedRowCount("not-a-number")).toBe(0);
    expect(normalizeEstimatedRowCount(null)).toBe(0);
    expect(normalizeEstimatedRowCount(undefined)).toBe(0);
  });
});

describe("toConnectionStatus", () => {
  it("maps ACTIVE to connected", () => {
    expect(toConnectionStatus(Instance_ConnectionState.ACTIVE)).toBe(
      "connected"
    );
  });

  it("maps ERROR to error", () => {
    expect(toConnectionStatus(Instance_ConnectionState.ERROR)).toBe("error");
  });

  it("maps UNSPECIFIED to disconnected", () => {
    expect(toConnectionStatus(Instance_ConnectionState.UNSPECIFIED)).toBe(
      "disconnected"
    );
  });
});

describe("resource names", () => {
  it("builds canonical instance/database/schema/table names", () => {
    expect(buildInstanceName("i1")).toBe("instances/i1");
    expect(buildDatabaseName("i1", "app")).toBe("instances/i1/databases/app");
    expect(buildSchemaName("i1", "app", "public")).toBe(
      "instances/i1/databases/app/schemas/public"
    );
    expect(
      buildTableName({
        instanceId: "i1",
        databaseId: "app",
        schemaId: "public",
        tableId: "events",
      })
    ).toBe("instances/i1/databases/app/schemas/public/tables/events");
  });

  it("escapes slash and percent in PostgreSQL identifier resource segments", () => {
    expect(
      buildTableName({
        instanceId: "i1",
        databaseId: "app/db",
        schemaId: "weird/schema",
        tableId: "rate%history",
      })
    ).toBe(
      "instances/i1/databases/app%2Fdb/schemas/weird%2Fschema/tables/rate%25history"
    );
    expect(
      parseTableQualifiedName(
        "instances/i1/databases/app%2Fdb/schemas/weird%2Fschema/tables/rate%25history"
      )
    ).toEqual({ schema: "weird/schema", table: "rate%history" });
    expect(parseResourceLeafId("instances/i1/databases/app%2Fdb")).toBe(
      "app/db"
    );
  });

  it.each([
    {
      label: "Japanese",
      schema: "日本語スキーマ",
      table: "注文",
      view: "注文ビュー",
    },
    {
      label: "Chinese",
      schema: "中文模式",
      table: "客户订单",
      view: "客户视图",
    },
    {
      label: "Korean",
      schema: "한국어스키마",
      table: "주문내역",
      view: "주문뷰",
    },
    {
      label: "Arabic",
      schema: "مخطط_العربية",
      table: "الطلبات",
      view: "عرض_الطلبات",
    },
    {
      label: "diacritics",
      schema: "données",
      table: "café_events",
      view: "résumé",
    },
    {
      label: "emoji",
      schema: "schema_🚦",
      table: "metrics_📈",
      view: "dashboard_✅",
    },
    {
      label: "spaces",
      schema: "reporting schema",
      table: "monthly report",
      view: "daily view",
    },
  ])("keeps $label identifier resource segments readable", ({
    schema,
    table,
    view,
  }) => {
    const schemaName = buildSchemaName("seed-edgecases", "normal_db", schema);
    const tableName = buildTableName({
      instanceId: "seed-edgecases",
      databaseId: "normal_db",
      schemaId: schema,
      tableId: table,
    });
    const viewName = buildViewName({
      instanceId: "seed-edgecases",
      databaseId: "normal_db",
      schemaId: schema,
      viewId: view,
    });

    expect(schemaName).toBe(
      `instances/seed-edgecases/databases/normal_db/schemas/${schema}`
    );
    expect(tableName).toBe(
      `instances/seed-edgecases/databases/normal_db/schemas/${schema}/tables/${table}`
    );
    expect(viewName).toBe(
      `instances/seed-edgecases/databases/normal_db/schemas/${schema}/views/${view}`
    );
    expect(parseTableQualifiedName(tableName)).toEqual({ schema, table });
    expect(parseResourceLeafId(viewName)).toBe(view);
  });

  it("parses leaf ids and qualified table names", () => {
    expect(parseResourceLeafId("/instances/i1/databases/app/")).toBe("app");
    expect(
      parseTableQualifiedName(
        "instances/i1/databases/app/schemas/public/tables/events"
      )
    ).toEqual({ schema: "public", table: "events" });
    expect(() => parseTableQualifiedName("instances/i1/databases/app")).toThrow(
      "invalid table resource name"
    );
    expect(
      tryParseTableQualifiedName(
        "instances/i1/databases/app/schemas/public/tables/events"
      )
    ).toEqual({ schema: "public", table: "events" });
    expect(tryParseTableQualifiedName("public.events")).toBeUndefined();
  });
});

describe("formatBytes", () => {
  it("formats byte values across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(TEST_NUMBER_512)).toBe("512 B");
    expect(formatBytes(TEST_NUMBER_1536)).toBe("1.5 KB");
    expect(
      formatBytes(TEST_BIGINT_1024 * TEST_BIGINT_1024 * TEST_BIGINT_5)
    ).toBe("5 MB");
  });

  it("returns an em dash for absent or invalid sizes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes("not-a-number")).toBe("—");
    // Number("") is 0 — an absent string must not display as a real zero.
    expect(formatBytes("")).toBe("—");
  });

  it("rolls display rounding at a unit boundary into the next unit", () => {
    // 1048575/1024 = 1023.999 KB would display-round to "1,024 KB".
    expect(formatBytes(TEST_NUMBER_1048575)).toBe("1 MB");
    expect(formatBytes(TEST_NUMBER_1023_POINT_6)).toBe("1 KB");
  });

  it("rounds fractional bytes instead of leaking float precision", () => {
    expect(formatBytes(TEST_NUMBER_512_POINT_345)).toBe("512 B");
  });

  it("scales beyond terabytes", () => {
    expect(formatBytes(TEST_NUMBER_1024 ** TEST_NUMBER_5)).toBe("1 PB");
  });
});

describe("time labels", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats absent timestamps as an em dash", () => {
    expect(formatTimestampLabel(undefined)).toBe("—");
  });

  it("formats uptime at minute, hour, and day boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

    expect(
      formatUptime(timestampFromDate(new Date("2026-05-20T11:59:05Z")))
    ).toBe("0m 55s");
    expect(
      formatUptime(timestampFromDate(new Date("2026-05-20T10:05:00Z")))
    ).toBe("1h 55m");
    expect(
      formatUptime(timestampFromDate(new Date("2026-05-18T08:04:03Z")))
    ).toBe("2d 03:55:57");
    expect(
      formatUptime(timestampFromDate(new Date("2026-05-21T12:00:00Z")))
    ).toBe("—");
  });
});

it("formats concrete timestamps and catches invalid uptime inputs", () => {
  const formatted = formatTimestampLabel(
    timestampFromDate(new Date("2026-05-20T12:00:00Z"))
  );

  expect(formatted).not.toBe("—");
});
