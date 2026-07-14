import { describe, expect, test } from "vitest";
import {
  buildTimeTicks,
  formatTimeTick,
  formatTooltipTime,
} from "@/lib/chart-time";

const TEST_NUMBER_1000 = 1000;
const TEST_NUMBER_2000 = 2000;
const TEST_NUMBER_5 = 5;
const TEST_NUMBER_6 = 6;
const TEST_NUMBER_7 = 7;
const TEST_NUMBER_30 = 30;
const TEST_NUMBER_2026 = 2026;
const TEST_NUMBER_12 = 12;
const TEST_NUMBER_14 = 14;
const TEST_NUMBER_32 = 32;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const MINUTES_PATTERN = /30/;
const DAY_OF_MONTH_PATTERN = /5/;
const TOOLTIP_MINUTES_PATTERN = /32/;

describe("buildTimeTicks", () => {
  test("returns empty for degenerate domains", () => {
    expect(buildTimeTicks(TEST_NUMBER_1000, TEST_NUMBER_1000)).toEqual([]);
    expect(buildTimeTicks(TEST_NUMBER_2000, TEST_NUMBER_1000)).toEqual([]);
    expect(buildTimeTicks(0, Number.NaN)).toEqual([]);
  });

  test("aligns a 1h window to whole 10-minute boundaries", () => {
    const start = 1_700_000_123_456;
    const ticks = buildTimeTicks(start, start + MS_PER_HOUR);

    expect(ticks.length).toBeGreaterThanOrEqual(TEST_NUMBER_5);
    expect(ticks.length).toBeLessThanOrEqual(TEST_NUMBER_6);
    for (const tick of ticks) {
      expect(tick % (10 * MS_PER_MINUTE)).toBe(0);
      expect(tick).toBeGreaterThanOrEqual(start);
      expect(tick).toBeLessThanOrEqual(start + MS_PER_HOUR);
    }
  });

  test("uses hour steps for a 6h window", () => {
    const start = 1_700_000_000_000;
    const ticks = buildTimeTicks(start, start + TEST_NUMBER_6 * MS_PER_HOUR);

    expect(ticks.length).toBeGreaterThanOrEqual(TEST_NUMBER_5);
    for (const tick of ticks) {
      expect(tick % MS_PER_HOUR).toBe(0);
    }
  });

  test("never exceeds the requested tick budget", () => {
    const start = 1_700_000_000_000;
    for (const spanMs of [
      TEST_NUMBER_5 * MS_PER_MINUTE,
      MS_PER_HOUR,
      TEST_NUMBER_6 * MS_PER_HOUR,
      MS_PER_DAY,
      TEST_NUMBER_7 * MS_PER_DAY,
      TEST_NUMBER_30 * MS_PER_DAY,
    ]) {
      expect(
        buildTimeTicks(start, start + spanMs, TEST_NUMBER_6).length
      ).toBeLessThanOrEqual(TEST_NUMBER_6);
    }
  });

  test("aligns multi-day windows to local midnights", () => {
    const start = 1_700_000_000_000;
    const ticks = buildTimeTicks(start, start + TEST_NUMBER_7 * MS_PER_DAY);

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      const date = new Date(tick);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    }
  });

  test("ticks are strictly increasing", () => {
    const start = 1_700_000_000_000;
    const ticks = buildTimeTicks(start, start + MS_PER_DAY);
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]).toBeGreaterThan(ticks[index - 1] ?? 0);
    }
  });
});

describe("formatTimeTick", () => {
  test("uses clock labels for intraday spans and dates beyond two days", () => {
    const noon = new Date(
      TEST_NUMBER_2026,
      TEST_NUMBER_6,
      TEST_NUMBER_5,
      TEST_NUMBER_12,
      TEST_NUMBER_30
    ).getTime();

    const clockLabel = formatTimeTick(noon, MS_PER_HOUR);
    expect(clockLabel).toMatch(MINUTES_PATTERN);

    const dateLabel = formatTimeTick(noon, TEST_NUMBER_7 * MS_PER_DAY);
    expect(dateLabel).not.toMatch(MINUTES_PATTERN);
    expect(dateLabel).toMatch(DAY_OF_MONTH_PATTERN);
  });
});

describe("formatTooltipTime", () => {
  test("always includes both the date and the clock time", () => {
    const label = formatTooltipTime(
      new Date(
        TEST_NUMBER_2026,
        TEST_NUMBER_6,
        TEST_NUMBER_5,
        TEST_NUMBER_14,
        TEST_NUMBER_32
      ).getTime()
    );
    expect(label).toMatch(DAY_OF_MONTH_PATTERN);
    expect(label).toMatch(TOOLTIP_MINUTES_PATTERN);
  });
});
