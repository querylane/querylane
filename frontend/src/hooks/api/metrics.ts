import {
  type UseQueryOptions as ConnectUseQueryOptions,
  useQuery as useConnectQuery,
} from "@connectrpc/connect-query";
import { buildDatabaseName, buildInstanceName } from "@/lib/console-resources";
import {
  buildDatabaseMetricsInput,
  buildInstanceMetricsInput,
  buildPreviousInstanceMetricsInput,
} from "@/lib/metrics";
import { queryMetrics } from "@/protogen/querylane/console/v1alpha1/metrics-MetricsService_connectquery";

/**
 * Quantizes to the current minute so the window (and thus the query key) is
 * stable across re-renders within the same minute instead of churning on every
 * render.
 */
const ANCHOR_QUANTUM_MS = 60_000;

/**
 * The window anchor for the overview metrics queries: "now", quantized to the
 * minute. The page owns the anchor as state and advances it on explicit
 * refresh, so a Refresh actually moves the queried window forward — a frozen
 * per-hook anchor would make refetches re-query the identical interval
 * forever. Both the current- and previous-window queries must share ONE anchor
 * value so their windows tile exactly.
 */
export function quantizedMetricsAnchor(): number {
  return Math.floor(Date.now() / ANCHOR_QUANTUM_MS) * ANCHOR_QUANTUM_MS;
}

/**
 * Queries the featured overview metrics for an instance over a trailing
 * `rangeHours` window ending at `anchorMs`, with a matching period-over-period
 * comparison. Changing `rangeHours` or `anchorMs` rebuilds the request (and
 * its query key) so range switches and refreshes refetch.
 */
export function useInstanceMetricsQuery({
  instanceId,
  anchorMs,
  rangeHours,
  options,
}: {
  instanceId: string;
  anchorMs: number;
  rangeHours: number;
  options?: ConnectUseQueryOptions<(typeof queryMetrics)["output"]>;
}) {
  const input = buildInstanceMetricsInput(
    buildInstanceName(instanceId),
    anchorMs,
    rangeHours
  );

  return useConnectQuery(queryMetrics, input, options);
}

/**
 * Queries the window immediately before the one `useInstanceMetricsQuery`
 * covers, for the comparison overlay. Pass the SAME `anchorMs` as the current
 * window's query so the two windows tile exactly.
 */
export function useInstancePreviousMetricsQuery({
  instanceId,
  anchorMs,
  rangeHours,
  options,
}: {
  instanceId: string;
  anchorMs: number;
  rangeHours: number;
  options?: ConnectUseQueryOptions<(typeof queryMetrics)["output"]>;
}) {
  const input = buildPreviousInstanceMetricsInput(
    buildInstanceName(instanceId),
    anchorMs,
    rangeHours
  );

  return useConnectQuery(queryMetrics, input, options);
}

/**
 * Queries the database-scoped stat-strip series (size, live/dead tuples) for
 * the database overview over a trailing `rangeHours` window ending at
 * `anchorMs`.
 */
export function useDatabaseMetricsQuery({
  anchorMs,
  databaseId,
  instanceId,
  options,
  rangeHours,
}: {
  anchorMs: number;
  databaseId: string;
  instanceId: string;
  options?: ConnectUseQueryOptions<(typeof queryMetrics)["output"]>;
  rangeHours: number;
}) {
  const input = buildDatabaseMetricsInput(
    buildDatabaseName(instanceId, databaseId),
    anchorMs,
    rangeHours
  );

  return useConnectQuery(queryMetrics, input, options);
}
