import { create } from "@bufbuild/protobuf";
import { anyPack, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, test } from "vitest";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import { StatusSchema } from "@/protogen/google/rpc/status_pb";

import {
  formatConnectionCheckLabel,
  getMetricPartialErrors,
} from "./instance-health";

const LAST_CHECKED_PREFIX_PATTERN = /^Last checked /;

describe("formatConnectionCheckLabel", () => {
  test("formats backend connection check timestamps", () => {
    expect(
      formatConnectionCheckLabel(
        timestampFromDate(new Date("2026-05-21T10:15:00Z"))
      )
    ).toMatch(LAST_CHECKED_PREFIX_PATTERN);
  });

  test("returns null when no backend check has run", () => {
    expect(formatConnectionCheckLabel(undefined)).toBeNull();
  });
});

describe("getMetricPartialErrors", () => {
  test("groups overview partial errors by metric metadata", () => {
    const detail = anyPack(
      ErrorInfoSchema,
      create(ErrorInfoSchema, {
        metadata: { metric: "cache" },
        reason: "METRIC_UNAVAILABLE",
      })
    );
    const errors = getMetricPartialErrors([
      create(StatusSchema, {
        details: [detail],
        message: "failed to query cache metrics",
      }),
    ]);

    expect(errors.cache?.message).toBe("failed to query cache metrics");
    expect(errors.connections).toBeUndefined();
  });

  test("groups I/O overview partial errors by metric metadata", () => {
    const detail = anyPack(
      ErrorInfoSchema,
      create(ErrorInfoSchema, {
        metadata: { metric: "io" },
        reason: "METRIC_UNAVAILABLE",
      })
    );
    const errors = getMetricPartialErrors([
      create(StatusSchema, {
        details: [detail],
        message: "failed to query I/O metrics",
      }),
    ]);

    expect(errors.io?.message).toBe("failed to query I/O metrics");
  });

  test("falls back to metric names in partial error messages", () => {
    const errors = getMetricPartialErrors([
      create(StatusSchema, { message: "failed to query storage metrics" }),
    ]);

    expect(errors.storage?.message).toBe("failed to query storage metrics");
  });

  test("matches I/O partial error messages without metadata", () => {
    const errors = getMetricPartialErrors([
      create(StatusSchema, { message: "failed to query I/O metrics" }),
    ]);

    expect(errors.io?.message).toBe("failed to query I/O metrics");
  });

  test("ignores unknown metric metadata", () => {
    const detail = anyPack(
      ErrorInfoSchema,
      create(ErrorInfoSchema, { metadata: { metric: "wal" } })
    );

    expect(
      getMetricPartialErrors([
        create(StatusSchema, { details: [detail], message: "unknown" }),
      ])
    ).toEqual({});
  });
});
