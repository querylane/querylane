import { describe, expect, it } from "vitest";
import {
  formatRefreshIntervalLabel,
  parseRefreshIntervalInput,
  refreshIntervalMsToValue,
  refreshValueToIntervalMs,
} from "@/features/user-settings/refresh-settings";

describe("refresh settings", () => {
  it("keeps never as the default refresh cadence", () => {
    expect(refreshValueToIntervalMs("never")).toBeNull();
    expect(refreshIntervalMsToValue(null)).toBe("never");
  });

  it("allows one minute as the fastest auto-refresh interval", () => {
    expect(refreshValueToIntervalMs("60000")).toBe(60_000);
    expect(refreshIntervalMsToValue(60_000)).toBe("60000");
  });

  it("rejects sub-minute or unknown refresh intervals", () => {
    expect(refreshValueToIntervalMs("1000")).toBeNull();
    expect(refreshValueToIntervalMs("unknown")).toBeNull();
  });

  it("parses natural language refresh intervals", async () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    expect(await parseRefreshIntervalInput("every 5 minutes", now)).toEqual({
      intervalMs: 300_000,
      ok: true,
    });
    expect(await parseRefreshIntervalInput("in 1 hour", now)).toEqual({
      intervalMs: 3_600_000,
      ok: true,
    });
    expect(await parseRefreshIntervalInput("off", now)).toEqual({
      intervalMs: null,
      ok: true,
    });
    expect(await parseRefreshIntervalInput("every day", now)).toEqual({
      intervalMs: 86_400_000,
      ok: true,
    });
    expect(await parseRefreshIntervalInput("every five hours", now)).toEqual({
      intervalMs: 18_000_000,
      ok: true,
    });
  });

  it("rounds absolute date inputs to human interval precision", async () => {
    const now = new Date("2026-06-15T17:06:38.978Z");

    const result = await parseRefreshIntervalInput("tomorrow at 9am", now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intervalMs).not.toBeNull();
      if (result.intervalMs === null) {
        throw new Error("Expected absolute date input to become an interval.");
      }
      expect(result.intervalMs % 60_000).toBe(0);
      expect(formatRefreshIntervalLabel(result.intervalMs)).not.toContain(
        "millisecond"
      );
    }
  });

  it("rejects stale, too fast, and too broad natural language intervals", async () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    expect(await parseRefreshIntervalInput("30 seconds", now)).toEqual({
      errors: ["Choose an interval of at least 1 minute."],
      ok: false,
    });
    expect(await parseRefreshIntervalInput("next week", now)).toEqual({
      errors: ["Choose an interval of 24 hours or less."],
      ok: false,
    });
  });

  it("formats custom intervals", () => {
    expect(formatRefreshIntervalLabel(90_000)).toBe(
      "Every 1 minute 30 seconds"
    );
    expect(formatRefreshIntervalLabel(7 * 60_000)).toBe("Every 7 minutes");
    expect(formatRefreshIntervalLabel(86_400_000)).toBe("Every day");
    expect(formatRefreshIntervalLabel(50_012_022)).toBe(
      "Every 13 hours 54 minutes"
    );
  });
});
