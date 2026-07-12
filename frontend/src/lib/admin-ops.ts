import { create } from "@bufbuild/protobuf";
import { TimestampSchema, timestampDate } from "@bufbuild/protobuf/wkt";
import { formatDistanceToNow } from "date-fns";
import type { AdminRunnerExecution } from "@/protogen/querylane/console/v1alpha1/admin_pb";

/**
 * Display length of a shortened replica id (xids are 20 chars; the tail is
 * the random part, the head is a timestamp shared by same-boot replicas).
 */
const SHORT_REPLICA_ID_LENGTH = 7;

/**
 * Background runners the backend schedules today. Static because the set
 * changes only with backend releases; the job queue's runner filter builds
 * an AIP-160 expression from these names.
 */
export const KNOWN_RUNNER_NAMES = [
  "instance_connectivity",
  "probe_connections",
  "probe_cache",
  "probe_storage",
  "probe_io",
  "probe_vacuum",
  "sample_retention",
] as const;

export const ALL_RUNNERS_FILTER_VALUE = "all";

export function buildRunnerFilter(runnerName: string): string {
  if (!runnerName || runnerName === ALL_RUNNERS_FILTER_VALUE) {
    return "";
  }
  return `runner_name = "${runnerName}"`;
}

export type JobExecutionStatus = "error" | "ok" | "pending" | "running";

/**
 * At-a-glance row status for the job queue. A held lease means a run is in
 * flight right now; otherwise the last finished run decides: an error beats
 * an older success, a success means healthy, neither means the runner has
 * not completed a run for this target yet.
 */
export function deriveJobExecutionStatus(
  execution: Pick<
    AdminRunnerExecution,
    "lastError" | "lastSuccessAt" | "leaseHeld"
  >
): JobExecutionStatus {
  if (execution.leaseHeld) {
    return "running";
  }
  if (execution.lastError) {
    return "error";
  }
  if (execution.lastSuccessAt) {
    return "ok";
  }
  return "pending";
}

export function shortReplicaId(replicaId: string): string {
  if (replicaId.length <= SHORT_REPLICA_ID_LENGTH) {
    return replicaId;
  }
  return replicaId.slice(-SHORT_REPLICA_ID_LENGTH);
}

export function formatRelativeTimestamp(
  timestamp: { seconds?: bigint; nanos?: number } | null | undefined
): string {
  if (!timestamp) {
    return "—";
  }

  try {
    return formatDistanceToNow(
      timestampDate(
        create(TimestampSchema, {
          nanos: timestamp.nanos ?? 0,
          seconds: timestamp.seconds ?? 0n,
        })
      ),
      { addSuffix: true }
    );
  } catch {
    return "—";
  }
}
