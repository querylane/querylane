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

/**
 * Downsamples chart rows to at most `maxPoints` by averaging fixed-size
 * buckets (bucket mean, timestamped at the bucket middle). A sparkline-sized
 * glyph drawing hundreds of raw buckets reads as pixel noise; ~2-4px per
 * segment reads as a trend. Gaps survive: a bucket with no finite values
 * stays null so outages still break the line.
 */
export function downsampleTrend(
  data: ChartRow[],
  seriesKey: string,
  maxPoints: number
): ChartRow[] {
  if (data.length <= maxPoints || maxPoints <= 0) {
    return data;
  }

  const bucketSize = Math.ceil(data.length / maxPoints);
  const sampled: ChartRow[] = [];
  for (let start = 0; start < data.length; start += bucketSize) {
    const bucket = data.slice(start, start + bucketSize);
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
