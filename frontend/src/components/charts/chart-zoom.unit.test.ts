import { expect, test } from "vitest";
import type { ChartRow, ChartSeries } from "@/components/charts/chart-context";
import { selectedDataDomain } from "@/components/charts/chart-zoom";

const SERIES: ChartSeries[] = [
  {
    color: "currentColor",
    dotClassName: "bg-primary",
    key: "value",
    label: "Transactions",
  },
];

const DATA: ChartRow[] = [
  { time: 0, value: null },
  { time: 1, value: null },
  { time: 2, value: 4 },
  { time: 3, value: 5 },
];

test("zooms only when the selected range has two drawable points", () => {
  expect(
    selectedDataDomain({ data: DATA, firstMs: 0, secondMs: 1, series: SERIES })
  ).toBeNull();
  expect(
    selectedDataDomain({ data: DATA, firstMs: 1, secondMs: 3, series: SERIES })
  ).toEqual([2, 3]);
});
