import { describe, expect, test } from "vitest";
import { niceAxisTicks } from "@/lib/chart-scale";
import { formatBytes } from "@/lib/console-resources";
import { formatCompactNumber } from "@/lib/metrics";

const TEST_NUMBER_5 = 5;
const TEST_NUMBER_2_POINT_9 = 2.9;
const TEST_NUMBER_3 = 3;
const TEST_NUMBER_0_POINT_9 = 0.9;
const TEST_NUMBER_0_POINT_2 = 0.2;
const TEST_NUMBER_0_POINT_4 = 0.4;
const TEST_NUMBER_0_POINT_6 = 0.6;
const TEST_NUMBER_0_POINT_8 = 0.8;
const TEST_NUMBER_45 = 45;
const TEST_NUMBER_20 = 20;
const TEST_NUMBER_30 = 30;
const TEST_NUMBER_40 = 40;
const TEST_NUMBER_50 = 50;
const TEST_NUMBER_184000 = 184_000;
const TEST_NUMBER_50000 = 50_000;
const TEST_NUMBER_100000 = 100_000;
const TEST_NUMBER_150000 = 150_000;
const TEST_NUMBER_200000 = 200_000;
const TEST_NUMBER_0_POINT_3 = 0.3;
const TEST_NUMBER_7 = 7;
const TEST_NUMBER_147 = 147;
const TEST_NUMBER_2840 = 2840;
const TEST_NUMBER_28600 = 28_600;
const TEST_NUMBER_1024 = 1024;
const TEST_NUMBER_100 = 100;
const TEST_NUMBER_150 = 150;
const TEST_NUMBER_300 = 300;
const TEST_NUMBER_200 = 200;
const TEST_NUMBER_700 = 700;

const KIB = 1024;

describe("niceAxisTicks (decimal)", () => {
  test("returns null when there is nothing to scale", () => {
    expect(niceAxisTicks(0, 10)).toBeNull();
    expect(niceAxisTicks(-TEST_NUMBER_5, 10)).toBeNull();
    expect(niceAxisTicks(Number.NaN, 10)).toBeNull();
  });

  test("small integer domains tick on whole numbers", () => {
    expect(niceAxisTicks(TEST_NUMBER_2_POINT_9, 10)).toEqual([
      0,
      1,
      2,
      TEST_NUMBER_3,
    ]);
  });

  test("sub-integer domains tick on clean fractions", () => {
    expect(niceAxisTicks(TEST_NUMBER_0_POINT_9, 10)).toEqual([
      0,
      TEST_NUMBER_0_POINT_2,
      TEST_NUMBER_0_POINT_4,
      TEST_NUMBER_0_POINT_6,
      TEST_NUMBER_0_POINT_8,
      1,
    ]);
  });

  test("larger domains use 1-2-5 ladder steps, rounded like d3", () => {
    // Nearest-in-log-space rounding: max 45 ticks to 50, not the ceil rule's
    // 33%-overshooting 60.
    expect(niceAxisTicks(TEST_NUMBER_45, 10)).toEqual([
      0,
      10,
      TEST_NUMBER_20,
      TEST_NUMBER_30,
      TEST_NUMBER_40,
      TEST_NUMBER_50,
    ]);
    expect(niceAxisTicks(TEST_NUMBER_184000, 10)).toEqual([
      0,
      TEST_NUMBER_50000,
      TEST_NUMBER_100000,
      TEST_NUMBER_150000,
      TEST_NUMBER_200000,
    ]);
  });

  test("formatted labels are always distinct", () => {
    for (const max of [
      TEST_NUMBER_0_POINT_3,
      TEST_NUMBER_0_POINT_9,
      TEST_NUMBER_2_POINT_9,
      TEST_NUMBER_7,
      TEST_NUMBER_45,
      TEST_NUMBER_147,
      TEST_NUMBER_2840,
      TEST_NUMBER_28600,
      TEST_NUMBER_184000,
    ]) {
      const labels = (niceAxisTicks(max, 10) ?? []).map(formatCompactNumber);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("niceAxisTicks (binary)", () => {
  test("byte domains tick on binary boundaries", () => {
    // The reported case: max ~147 KiB/s must tick 0 / 50 / 100 / 150 KB,
    // not decimal steps that format as "48,8 KB".
    expect(niceAxisTicks(TEST_NUMBER_147 * KIB, TEST_NUMBER_1024)).toEqual([
      0,
      TEST_NUMBER_50 * KIB,
      TEST_NUMBER_100 * KIB,
      TEST_NUMBER_150 * KIB,
    ]);
  });

  test("rolls into MB-scale steps as the data grows", () => {
    const ticks =
      niceAxisTicks(TEST_NUMBER_300 * KIB * KIB, TEST_NUMBER_1024) ?? [];
    expect(ticks).toEqual([
      0,
      TEST_NUMBER_100 * KIB * KIB,
      TEST_NUMBER_200 * KIB * KIB,
      TEST_NUMBER_300 * KIB * KIB,
    ]);
  });

  test("binary tick labels format without decimals", () => {
    for (const max of [
      TEST_NUMBER_147 * KIB,
      TEST_NUMBER_3 * KIB,
      TEST_NUMBER_700 * KIB * KIB,
    ]) {
      const labels = (niceAxisTicks(max, TEST_NUMBER_1024) ?? []).map((tick) =>
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
