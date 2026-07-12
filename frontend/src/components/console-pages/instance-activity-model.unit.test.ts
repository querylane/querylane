import { describe, expect, test } from "vitest";
import {
  formatActivityDuration,
  getActivityBlockingChains,
  presentActivityFilterOptions,
  presentActivitySessionRows,
  presentActivityStats,
} from "@/components/console-pages/instance-activity-model";

describe("instance activity model", () => {
  test("presents connection stats from pg_stat_activity health", () => {
    const stats = presentActivityStats({
      activeConnections: 3,
      idleConnections: 39,
      idleInTransactionConnections: 2,
      longestTransactionSeconds: 252,
      waitingForLockConnections: 1,
    });

    expect(stats.map((stat) => [stat.label, stat.value])).toEqual([
      ["Active", "3"],
      ["Idle", "39"],
      ["Idle in transaction", "2"],
      ["Waiting", "1"],
      ["Oldest transaction", "4m 12s"],
    ]);
  });

  test("formats zero and long durations without empty output", () => {
    expect(formatActivityDuration(0)).toBe("0s");
    expect(formatActivityDuration(3661)).toBe("1h 1m");
  });

  test("presents unavailable stats as placeholders", () => {
    expect(presentActivityStats(undefined).map((stat) => stat.value)).toEqual([
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
  });

  test("presents live sessions and blocking chain from pg_stat_activity rows", () => {
    const rows = presentActivitySessionRows(
      {
        sessions: [
          {
            applicationName: "worker-pool",
            databaseName: "logistics",
            durationSeconds: 252,
            pid: 4211,
            query: "UPDATE shipping.shipments SET status = 'in_transit'",
            state: "idle in transaction",
            username: "app_readwrite",
          },
          {
            applicationName: "api-gateway",
            blockedByPid: 4211,
            databaseName: "logistics",
            durationSeconds: 38,
            pid: 4302,
            query: "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
            state: "active",
            username: "app_readwrite",
            waitEvent: "transactionid",
            waitEventType: "Lock",
          },
        ],
      },
      {
        app: null,
        database: null,
        search: "shipping",
        state: null,
      }
    );

    expect(rows).toMatchObject([
      {
        app: "worker-pool",
        duration: "4m 12s",
        durationHot: true,
        pid: 4211,
        stateTone: "warning",
        user: "app_readwrite",
      },
      {
        app: "api-gateway",
        blockedByPid: 4211,
        duration: "38s",
        durationHot: true,
        pid: 4302,
        stateTone: "success",
        wait: "Lock · transactionid",
      },
    ]);
    expect(presentActivityFilterOptions(rows, "app")).toEqual([
      "api-gateway",
      "worker-pool",
    ]);
    expect(getActivityBlockingChains(rows)).toMatchObject([
      {
        blocked: [{ pid: 4302 }],
        blocker: { pid: 4211 },
        blockerPid: 4211,
      },
    ]);
  });

  test("keeps every blocking chain and missing blocker visible", () => {
    const rows = presentActivitySessionRows(
      {
        sessions: [
          {
            applicationName: "worker-a",
            databaseName: "app",
            durationSeconds: 20,
            pid: 100,
            query: "UPDATE one",
            state: "active",
            username: "app",
          },
          {
            applicationName: "api",
            blockedByPid: 100,
            databaseName: "app",
            durationSeconds: 10,
            pid: 101,
            query: "UPDATE two",
            state: "active",
            username: "app",
          },
          {
            applicationName: "api",
            blockedByPid: 999,
            databaseName: "app",
            durationSeconds: 5,
            pid: 102,
            query: "UPDATE three",
            state: "active",
            username: "app",
          },
        ],
      },
      { app: null, database: null, search: "", state: null }
    );

    expect(getActivityBlockingChains(rows)).toMatchObject([
      {
        blocked: [{ pid: 101 }],
        blocker: { pid: 100 },
        blockerPid: 100,
      },
      {
        blocked: [{ pid: 102 }],
        blocker: null,
        blockerPid: 999,
      },
    ]);
  });

  test("filters a real value named All without treating it as a sentinel", () => {
    const activity = {
      sessions: [
        {
          applicationName: "All",
          databaseName: "app",
          durationSeconds: 1,
          pid: 100,
          query: "SELECT 1",
          state: "active",
          username: "app",
        },
        {
          applicationName: "api",
          databaseName: "app",
          durationSeconds: 1,
          pid: 101,
          query: "SELECT 2",
          state: "active",
          username: "app",
        },
      ],
    };

    const allRows = presentActivitySessionRows(activity, {
      app: null,
      database: null,
      search: "",
      state: null,
    });
    const literalAllRows = presentActivitySessionRows(activity, {
      app: "All",
      database: null,
      search: "",
      state: null,
    });

    expect(presentActivityFilterOptions(allRows, "app")).toEqual([
      "All",
      "api",
    ]);
    expect(literalAllRows.map((row) => row.pid)).toEqual([100]);
  });
});
