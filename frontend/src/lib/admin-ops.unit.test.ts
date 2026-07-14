import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  ALL_RUNNERS_FILTER_VALUE,
  buildRunnerFilter,
  deriveJobExecutionStatus,
  formatRelativeTimestamp,
  shortReplicaId,
} from "@/lib/admin-ops";

const TEST_NUMBER_60000 = 60_000;

describe("buildRunnerFilter", () => {
  it("returns empty filter for the all-runners sentinel", () => {
    expect(buildRunnerFilter(ALL_RUNNERS_FILTER_VALUE)).toBe("");
    expect(buildRunnerFilter("")).toBe("");
  });

  it("builds an AIP-160 equality expression", () => {
    expect(buildRunnerFilter("probe_cache")).toBe(
      'runner_name = "probe_cache"'
    );
  });
});

describe("deriveJobExecutionStatus", () => {
  const success = timestampFromDate(new Date("2026-07-01T00:00:00Z"));

  it("reports running while a lease is held, even with a stale error", () => {
    expect(
      deriveJobExecutionStatus({
        lastError: "boom",
        lastSuccessAt: success,
        leaseHeld: true,
      })
    ).toBe("running");
  });

  it("reports error when the last run failed", () => {
    expect(
      deriveJobExecutionStatus({
        lastError: "connection refused",
        lastSuccessAt: success,
        leaseHeld: false,
      })
    ).toBe("error");
  });

  it("reports ok after a clean success", () => {
    expect(
      deriveJobExecutionStatus({
        lastError: "",
        lastSuccessAt: success,
        leaseHeld: false,
      })
    ).toBe("ok");
  });

  it("reports pending before the first completed run", () => {
    expect(
      deriveJobExecutionStatus({
        lastError: "",
        leaseHeld: false,
      })
    ).toBe("pending");
  });
});

describe("shortReplicaId", () => {
  it("keeps short ids intact", () => {
    expect(shortReplicaId("abc")).toBe("abc");
  });

  it("keeps the random tail of xid-length ids", () => {
    expect(shortReplicaId("d1nne50ck2mvttcs0he0")).toBe("tcs0he0");
  });
});

describe("formatRelativeTimestamp", () => {
  it("returns a dash for missing timestamps", () => {
    expect(formatRelativeTimestamp(undefined)).toBe("—");
    expect(formatRelativeTimestamp(null)).toBe("—");
  });

  it("formats a past timestamp relative to now", () => {
    const timestamp = timestampFromDate(
      new Date(Date.now() - TEST_NUMBER_60000)
    );
    expect(formatRelativeTimestamp(timestamp)).toContain("minute");
  });
});
