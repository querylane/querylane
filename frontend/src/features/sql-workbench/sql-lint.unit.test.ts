import { describe, expect, it } from "@rstest/core";
import type { SqlProblem } from "@/features/sql-workbench/sql-diagnostics";
import {
  mapWithConcurrency,
  ProblemCache,
} from "@/features/sql-workbench/sql-lint";
import type { SqlValidator } from "@/features/sql-workbench/use-sql-validation";

const PROBLEM: SqlProblem = {
  detail: "",
  hint: "",
  message: 'relation "nope" does not exist',
  position: 15,
  sqlstate: "42P01",
};

function countingValidator(
  results: ReadonlyArray<SqlProblem | null | undefined>,
  scopeKey = "public"
) {
  const calls: string[] = [];
  const validator: SqlValidator = {
    check: (statement) => {
      calls.push(statement);
      return Promise.resolve(results[calls.length - 1]);
    },
    scopeKey,
  };
  return { calls, validator };
}

describe("ProblemCache", () => {
  it("asks the server once per statement and scope", async () => {
    const cache = new ProblemCache();
    const { calls, validator } = countingValidator([PROBLEM, null]);
    const { signal } = new AbortController();

    expect(await cache.lookup("select * from nope", validator, signal)).toBe(
      PROBLEM
    );
    expect(await cache.lookup("select * from nope", validator, signal)).toBe(
      PROBLEM
    );
    expect(await cache.lookup("select 1", validator, signal)).toBeNull();
    expect(await cache.lookup("select 1", validator, signal)).toBeNull();
    expect(calls).toEqual(["select * from nope", "select 1"]);
  });

  it("re-checks a statement after a failed check instead of calling it valid", async () => {
    const cache = new ProblemCache();
    const { calls, validator } = countingValidator([undefined, PROBLEM]);
    const { signal } = new AbortController();

    expect(await cache.lookup("select * from nope", validator, signal)).toBe(
      undefined
    );
    expect(await cache.lookup("select * from nope", validator, signal)).toBe(
      PROBLEM
    );
    expect(calls).toHaveLength(2);
  });

  it("keeps results apart per default schema", async () => {
    const cache = new ProblemCache();
    const { signal } = new AbortController();
    const inPublic = countingValidator([PROBLEM], "public");
    const inSales = countingValidator([null], "sales");

    await cache.lookup("select * from orders", inPublic.validator, signal);
    expect(
      await cache.lookup("select * from orders", inSales.validator, signal)
    ).toBeNull();
    expect(inSales.calls).toHaveLength(1);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps results in input order with at most `limit` tasks in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency(
      [30, 10, 20, 0, 5],
      2,
      async (delay) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, delay));
        inFlight -= 1;
        return delay * 2;
      }
    );
    expect(results).toEqual([60, 20, 40, 0, 10]);
    expect(peak).toBe(2);
  });

  it("returns an empty list for no items", async () => {
    expect(await mapWithConcurrency([], 2, () => Promise.resolve(1))).toEqual(
      []
    );
  });
});
