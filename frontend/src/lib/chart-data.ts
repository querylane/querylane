import type { ChartRow } from "@/components/charts/chart-context";

function averageBucket(bucket: ChartRow[], seriesKey: string): number | null {
  let sum = 0;
  let finiteCount = 0;
  for (const row of bucket) {
    const value = row[seriesKey];
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      finiteCount += 1;
    }
  }
  return finiteCount > 0 ? sum / finiteCount : null;
}

function hasFiniteSeriesValue(row: ChartRow, seriesKey: string): boolean {
  const value = row[seriesKey];
  return typeof value === "number" && Number.isFinite(value);
}

function observedTrendSpan(data: ChartRow[], seriesKey: string): ChartRow[] {
  const firstObservedIndex = data.findIndex((row) =>
    hasFiniteSeriesValue(row, seriesKey)
  );
  if (firstObservedIndex === -1) {
    return [];
  }

  const lastObservedIndex = data.findLastIndex((row) =>
    hasFiniteSeriesValue(row, seriesKey)
  );
  if (firstObservedIndex === 0 && lastObservedIndex === data.length - 1) {
    return data;
  }
  return data.slice(firstObservedIndex, lastObservedIndex + 1);
}

/**
 * Downsamples chart rows to at most `maxPoints` by averaging fixed-size
 * buckets (bucket mean, timestamped at the bucket middle). A sparkline-sized
 * glyph drawing hundreds of raw buckets reads as pixel noise; ~2-4px per
 * segment reads as a trend. Empty outer buckets are cropped so the observed
 * span fills the glyph. Gaps inside that span survive, so outages still break
 * the line.
 */
export function downsampleTrend(
  data: ChartRow[],
  seriesKey: string,
  maxPoints: number
): ChartRow[] {
  const observedData = observedTrendSpan(data, seriesKey);
  if (observedData.length <= maxPoints || maxPoints <= 0) {
    return observedData;
  }

  const bucketSize = Math.ceil(observedData.length / maxPoints);
  const sampled: ChartRow[] = [];
  for (let start = 0; start < observedData.length; start += bucketSize) {
    const bucket = observedData.slice(start, start + bucketSize);
    const middle = bucket[Math.floor(bucket.length / 2)] ?? bucket[0];
    if (middle !== undefined) {
      sampled.push({
        [seriesKey]: averageBucket(bucket, seriesKey),
        time: middle.time,
      });
    }
  }

  return sampled;
}
