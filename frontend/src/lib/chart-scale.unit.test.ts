import { describe, expect, test } from "vitest";
import { niceAxisRangeTicks, niceAxisTicks } from "@/lib/chart-scale";
import { formatBytes } from "@/lib/console-resources";
import { formatCompactNumber } from "@/lib/metrics";

const KIB = 1024;

describe("niceAxisTicks (decimal)", () => {
  test("returns null when there is nothing to scale", () => {
    expect(niceAxisTicks(0, 10)).toBeNull();
    expect(niceAxisTicks(-5, 10)).toBeNull();
    expect(niceAxisTicks(Number.NaN, 10)).toBeNull();
  });

  test("small integer domains tick on whole numbers", () => {
    expect(niceAxisTicks(2.9, 10)).toEqual([0, 1, 2, 3]);
  });

  test("honors a compact segment budget", () => {
    expect(niceAxisTicks(100, 10, 2)).toEqual([0, 50, 100]);
    expect(niceAxisTicks(60, 10, 2)).toEqual([0, 50, 100]);
  });

  test("sub-integer domains tick on clean fractions", () => {
    expect(niceAxisTicks(0.9, 10)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  test("larger domains use 1-2-5 ladder steps, rounded like d3", () => {
    // Nearest-in-log-space rounding: max 45 ticks to 50, not the ceil rule's
    // 33%-overshooting 60.
    expect(niceAxisTicks(45, 10)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(niceAxisTicks(184_000, 10)).toEqual([
      0, 50_000, 100_000, 150_000, 200_000,
    ]);
  });

  test("formatted labels are always distinct", () => {
    for (const max of [0.3, 0.9, 2.9, 7, 45, 147, 2840, 28_600, 184_000]) {
      const labels = (niceAxisTicks(max, 10) ?? []).map(formatCompactNumber);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("niceAxisTicks (binary)", () => {
  test("byte domains tick on binary boundaries", () => {
    // The reported case: max ~147 KiB/s must tick 0 / 50 / 100 / 150 KB,
    // not decimal steps that format as "48,8 KB".
    expect(niceAxisTicks(147 * KIB, 1024)).toEqual([
      0,
      50 * KIB,
      100 * KIB,
      150 * KIB,
    ]);
  });

  test("rolls into MB-scale steps as the data grows", () => {
    const ticks = niceAxisTicks(300 * KIB * KIB, 1024) ?? [];
    expect(ticks).toEqual([
      0,
      100 * KIB * KIB,
      200 * KIB * KIB,
      300 * KIB * KIB,
    ]);
  });

  test("binary tick labels format without decimals", () => {
    for (const max of [147 * KIB, 3 * KIB, 700 * KIB * KIB]) {
      const labels = (niceAxisTicks(max, 1024) ?? []).map((tick) =>
        formatBytes(tick)
      );
      expect(new Set(labels).size).toBe(labels.length);
      for (const label of labels.slice(1)) {
        expect(label).not.toMatch(DECIMAL_LABEL_PATTERN);
      }
    }
  });
});

describe("niceAxisRangeTicks", () => {
  test("focuses byte trends on their meaningful range", () => {
    expect(
      niceAxisRangeTicks({
        formatValue: (tick) => formatBytes(tick),
        maxSegments: 4,
        maxValue: 60_500_000,
        minValue: 58_900_000,
        tickBase: 1024,
      })
    ).toEqual([58_880_000, 59_392_000, 59_904_000, 60_416_000, 60_928_000]);
  });

  test("widens the step until compact labels stay distinct", () => {
    expect(
      niceAxisRangeTicks({
        formatValue: formatCompactNumber,
        maxSegments: 4,
        maxValue: 1_270_000,
        minValue: 1_220_000,
        tickBase: 10,
      })
    ).toEqual([1_200_000, 1_300_000]);
  });
});

const DECIMAL_LABEL_PATTERN = /[.,]\d/;
