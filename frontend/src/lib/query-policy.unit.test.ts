import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";

import {
  MUTATION_DEFAULTS,
  QUERY_DEFAULTS,
  shouldRetryQuery,
  UNAVAILABLE_QUERY_RETRY_LIMIT,
} from "@/lib/query-policy";

describe("shouldRetryQuery", () => {
  it("retries unavailable errors until the retry limit", () => {
    const unavailable = new ConnectError("starting up", Code.Unavailable);

    expect(shouldRetryQuery(0, unavailable)).toBe(true);
    expect(shouldRetryQuery(UNAVAILABLE_QUERY_RETRY_LIMIT, unavailable)).toBe(
      false
    );
  });

  it("does not retry deadline errors so users are not kept waiting", () => {
    const timedOut = new ConnectError(
      "the operation timed out",
      Code.DeadlineExceeded
    );

    expect(shouldRetryQuery(0, timedOut)).toBe(false);
  });

  it("does not retry non-connect or other connect failures", () => {
    expect(shouldRetryQuery(0, new Error("boom"))).toBe(false);
    expect(
      shouldRetryQuery(0, new ConnectError("nope", Code.PermissionDenied))
    ).toBe(false);
    expect(shouldRetryQuery(0, null)).toBe(false);
  });
});

describe("query defaults", () => {
  it("wires the retry policy into query defaults but keeps mutations retry-free", () => {
    expect(QUERY_DEFAULTS.retry).toBe(shouldRetryQuery);
    expect(MUTATION_DEFAULTS.retry).toBe(false);
  });
});
