import { create } from "@bufbuild/protobuf";
import {
  type Timestamp,
  TimestampSchema,
  timestampDate,
} from "@bufbuild/protobuf/wkt";
import { Instance_ConnectionState } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type DbConnectionStatus = "connected" | "disconnected" | "error";

interface QualifiedTableName {
  schema: string;
  table: string;
}

// Pinned to en-US like the metric formatters in lib/metrics.ts — a mixed
// locale would render "1,5 KB" storage next to "1.5" axis ticks.
const byteFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const BYTE_DECIMAL_SCALE = 10;
const BYTES_PER_KIBIBYTE = 1024;
const TABLE_RESOURCE_NAME_PATTERN =
  /^instances\/[^/]+\/databases\/[^/]+\/schemas\/([^/]+)\/tables\/([^/]+)$/;

// Keep frontend resource names in lockstep with backend/resource/internal.go:
// resource-name IDs only escape the path separator and escape character.
// Non-ASCII IDs stay readable on the wire.
function encodeResourceSegment(segment: string): string {
  return segment.replaceAll("%", "%25").replaceAll("/", "%2F");
}

function decodeResourceSegment(segment: string): string {
  return segment.replaceAll("%2F", "/").replaceAll("%25", "%");
}

function splitResourceName(name: string): string[] {
  return name.split("/").filter((segment) => segment.length > 0);
}

function toTimestamp(value: { seconds?: bigint; nanos?: number }): Timestamp {
  return create(TimestampSchema, {
    nanos: value.nanos ?? 0,
    seconds: value.seconds ?? 0n,
  });
}

export function buildInstanceName(instanceId: string): string {
  return `instances/${encodeResourceSegment(instanceId)}`;
}

export function buildDatabaseName(
  instanceId: string,
  databaseId: string
): string {
  return `${buildInstanceName(instanceId)}/databases/${encodeResourceSegment(databaseId)}`;
}

// Unlike the sibling builders, roleId is NOT percent-encoded: it is already a
// base64url id (see backend resource.EncodeRoleID — alphabet [A-Za-z0-9_-], so
// URL-safe). The backend decodes this segment with base64, not decodeURIComponent,
// and parseResourceLeafId/roleIdOf round-trip it verbatim — re-encoding it here
// would be wrong.
export function buildRoleName(instanceId: string, roleId: string): string {
  return `${buildInstanceName(instanceId)}/roles/${roleId}`;
}

export function buildSchemaName(
  instanceId: string,
  databaseId: string,
  schemaId: string
): string {
  return `${buildDatabaseName(instanceId, databaseId)}/schemas/${encodeResourceSegment(schemaId)}`;
}

export function buildTableName(
  instanceId: string,
  databaseId: string,
  schemaId: string,
  tableId: string
): string {
  return `${buildSchemaName(instanceId, databaseId, schemaId)}/tables/${encodeResourceSegment(tableId)}`;
}

export function buildViewName(
  instanceId: string,
  databaseId: string,
  schemaId: string,
  viewId: string
): string {
  return `${buildSchemaName(instanceId, databaseId, schemaId)}/views/${encodeResourceSegment(viewId)}`;
}

export function parseResourceLeafId(name: string): string {
  const segments = splitResourceName(name);
  return decodeResourceSegment(segments.at(-1) ?? name);
}

export function parseTableQualifiedName(name: string): QualifiedTableName {
  const parsed = tryParseTableQualifiedName(name);
  if (!parsed) {
    throw new Error(`invalid table resource name: ${name}`);
  }
  return parsed;
}

export function tryParseTableQualifiedName(
  name: string
): QualifiedTableName | undefined {
  const match = TABLE_RESOURCE_NAME_PATTERN.exec(name);
  if (!(match?.[1] && match[2])) {
    return;
  }
  return {
    schema: decodeResourceSegment(match[1]),
    table: decodeResourceSegment(match[2]),
  };
}

export function formatBytes(
  sizeBytes: bigint | number | string | null | undefined
): string {
  if (
    sizeBytes === null ||
    sizeBytes === undefined ||
    (typeof sizeBytes === "string" && sizeBytes.trim() === "")
  ) {
    return "—";
  }

  let numeric: number;
  if (typeof sizeBytes === "bigint" || typeof sizeBytes === "string") {
    numeric = Number(sizeBytes);
  } else {
    numeric = sizeBytes;
  }

  if (!Number.isFinite(numeric) || numeric < 0) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let unitIndex = 0;
  let value = numeric;

  while (value >= BYTES_PER_KIBIBYTE && unitIndex < units.length - 1) {
    value /= BYTES_PER_KIBIBYTE;
    unitIndex += 1;
  }

  // Round to the displayed precision FIRST, then check for boundary overshoot:
  // 1048575 B scales to 1023.999 KB, which display-rounds to "1,024 KB" — roll
  // it into the next unit instead (the filesize.js applyRounding technique).
  let rounded =
    unitIndex === 0
      ? Math.round(value)
      : Math.round(value * BYTE_DECIMAL_SCALE) / BYTE_DECIMAL_SCALE;
  if (rounded >= BYTES_PER_KIBIBYTE && unitIndex < units.length - 1) {
    rounded /= BYTES_PER_KIBIBYTE;
    unitIndex += 1;
  }

  return `${byteFormatter.format(rounded)} ${units[unitIndex]}`;
}

export function normalizeEstimatedRowCount(
  value: bigint | number | string | null | undefined
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
}

export function toConnectionStatus(
  state: Instance_ConnectionState
): DbConnectionStatus {
  if (state === Instance_ConnectionState.ACTIVE) {
    return "connected";
  }

  if (state === Instance_ConnectionState.ERROR) {
    return "error";
  }

  return "disconnected";
}

export function formatTimestampLabel(
  timestamp: { seconds?: bigint; nanos?: number } | null | undefined
): string {
  if (!timestamp) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestampDate(toTimestamp(timestamp)));
  } catch {
    return "—";
  }
}

export function formatUptime(
  startedAt: { seconds?: bigint; nanos?: number } | null | undefined
): string {
  if (!startedAt) {
    return "—";
  }

  try {
    const start = timestampDate(toTimestamp(startedAt));
    const diffMs = Date.now() - start.getTime();
    if (diffMs < 0) {
      return "—";
    }

    const MsPerSecond = 1000;
    const SecondsPerDay = 86_400;
    const SecondsPerHour = 3600;
    const SecondsPerMinute = 60;

    const totalSeconds = Math.floor(diffMs / MsPerSecond);
    const days = Math.floor(totalSeconds / SecondsPerDay);
    const hours = Math.floor((totalSeconds % SecondsPerDay) / SecondsPerHour);
    const minutes = Math.floor(
      (totalSeconds % SecondsPerHour) / SecondsPerMinute
    );
    const seconds = totalSeconds % SecondsPerMinute;

    const pad = (n: number) => String(n).padStart(2, "0");

    if (days > 0) {
      return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    if (hours > 0) {
      return `${hours}h ${pad(minutes)}m`;
    }
    return `${minutes}m ${pad(seconds)}s`;
  } catch {
    return "—";
  }
}

export type { DbConnectionStatus, QualifiedTableName };
