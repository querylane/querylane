import { describe, expect, test } from "@rstest/core";
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

  test("formatted labels are always distinct", () => {
    for (const max of [0.3, 0.9, 2.9, 7, 45, 147, 2840, 28_600, 184_000]) {
      const labels = (niceAxisTicks(max, 10) ?? []).map(formatCompactNumber);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("niceAxisTicks (binary)", () => {
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
