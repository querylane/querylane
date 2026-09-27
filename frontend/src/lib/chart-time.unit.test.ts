import { describe, expect, test } from "@rstest/core";
import {
  buildTimeTicks,
  formatTimeTick,
  formatTooltipTime,
} from "@/lib/chart-time";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const MINUTES_PATTERN = /30/;
const DAY_OF_MONTH_PATTERN = /5/;
const TOOLTIP_MINUTES_PATTERN = /32/;

describe("buildTimeTicks", () => {
  test("returns empty for degenerate domains", () => {
    expect(buildTimeTicks(1000, 1000)).toEqual([]);
    expect(buildTimeTicks(2000, 1000)).toEqual([]);
    expect(buildTimeTicks(0, Number.NaN)).toEqual([]);
  });

  test("never exceeds the requested tick budget", () => {
    const start = 1_700_000_000_000;
    for (const spanMs of [
      5 * MS_PER_MINUTE,
      MS_PER_HOUR,
      6 * MS_PER_HOUR,
      MS_PER_DAY,
      7 * MS_PER_DAY,
      30 * MS_PER_DAY,
    ]) {
      expect(
        buildTimeTicks(start, start + spanMs, 6).length
      ).toBeLessThanOrEqual(6);
    }
  });
});

describe("formatTimeTick", () => {
  test("uses clock labels for intraday spans and dates beyond two days", () => {
    const noon = new Date(2026, 6, 5, 12, 30).getTime();

    const clockLabel = formatTimeTick(noon, MS_PER_HOUR);
    expect(clockLabel).toMatch(MINUTES_PATTERN);

    const dateLabel = formatTimeTick(noon, 7 * MS_PER_DAY);
    expect(dateLabel).not.toMatch(MINUTES_PATTERN);
    expect(dateLabel).toMatch(DAY_OF_MONTH_PATTERN);
  });
});

describe("formatTooltipTime", () => {
  test("always includes both the date and the clock time", () => {
    const label = formatTooltipTime(new Date(2026, 6, 5, 14, 32).getTime());
    expect(label).toMatch(DAY_OF_MONTH_PATTERN);
    expect(label).toMatch(TOOLTIP_MINUTES_PATTERN);
  });
});
