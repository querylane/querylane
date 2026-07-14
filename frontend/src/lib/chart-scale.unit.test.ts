import { describe, expect, test } from "vitest";
import { niceAxisTicks } from "@/lib/chart-scale";
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

const DECIMAL_LABEL_PATTERN = /[.,]\d/;
