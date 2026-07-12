import { describe, expect, test } from "vitest";
import {
  formatActivityDuration,
  getActivityBlockingChain,
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
        app: "All",
        database: "All",
        search: "shipping",
        state: "All",
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
      "All",
      "api-gateway",
      "worker-pool",
    ]);
    expect(getActivityBlockingChain(rows)).toMatchObject({
      blocked: [{ pid: 4302 }],
      blocker: { pid: 4211 },
    });
  });
});
