import { describe, expect, test } from "vitest";
import { downsampleTrend } from "@/lib/chart-data";

const TEST_NUMBER_1000 = 1000;
const TEST_NUMBER_3 = 3;
const TEST_NUMBER_0_POINT_5 = 0.5;
const TEST_NUMBER_99000 = 99_000;

function rows(values: (number | null)[]): { time: number; v: number | null }[] {
  return values.map((v, index) => ({ time: index * TEST_NUMBER_1000, v }));
}

describe("downsampleTrend", () => {
  test("returns data unchanged at or under the budget", () => {
    const data = rows([1, 2, TEST_NUMBER_3]);
    expect(downsampleTrend(data, "v", 24)).toBe(data);
  });

  test("averages buckets down to the budget", () => {
    const data = rows(Array.from({ length: 240 }, (_, index) => index % 2));
    const sampled = downsampleTrend(data, "v", 24);

    expect(sampled.length).toBeLessThanOrEqual(24);
    for (const row of sampled) {
      expect(row["v"]).toBe(TEST_NUMBER_0_POINT_5);
    }
  });

  test("keeps timestamps ordered and within the source span", () => {
    const data = rows(Array.from({ length: 100 }, (_, index) => index));
    const sampled = downsampleTrend(data, "v", 10);

    for (let index = 1; index < sampled.length; index += 1) {
      expect(sampled[index]?.time).toBeGreaterThan(
        sampled[index - 1]?.time ?? 0
      );
    }
    expect(sampled[0]?.time).toBeGreaterThanOrEqual(0);
    expect(sampled.at(-1)?.time).toBeLessThanOrEqual(TEST_NUMBER_99000);
  });

  test("a bucket with no finite values stays a gap", () => {
    const data = rows([
      ...Array.from({ length: 50 }, () => 1),
      ...Array.from({ length: 50 }, (): null => null),
    ]);
    const sampled = downsampleTrend(data, "v", 10);

    expect(sampled.some((row) => row["v"] === null)).toBe(true);
    expect(sampled.some((row) => row["v"] === 1)).toBe(true);
  });
});
