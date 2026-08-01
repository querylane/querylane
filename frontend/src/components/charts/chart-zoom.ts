import type { ChartRow, ChartSeries } from "@/components/charts/chart-context";

function hasDrawableValue(row: ChartRow, series: ChartSeries[]): boolean {
  return series.some((item) => {
    const value = row[item.key];
    return typeof value === "number" && Number.isFinite(value);
  });
}

/** Snaps a pointer-selected interval to its first and last drawable rows. */
function selectedDataDomain({
  data,
  firstMs,
  secondMs,
  series,
}: {
  data: ChartRow[];
  firstMs: number;
  secondMs: number;
  series: ChartSeries[];
}): [number, number] | null {
  const selectionMin = Math.min(firstMs, secondMs);
  const selectionMax = Math.max(firstMs, secondMs);
  const selected = data.filter(
    (row) =>
      row.time >= selectionMin &&
      row.time <= selectionMax &&
      hasDrawableValue(row, series)
  );
  const first = selected[0]?.time;
  const last = selected.at(-1)?.time;

  return first !== undefined && last !== undefined && first < last
    ? [first, last]
    : null;
}

export { selectedDataDomain };
