import { create } from "@bufbuild/protobuf";
import { TimestampSchema, timestampDate } from "@bufbuild/protobuf/wkt";
import { isNonEmptyString } from "@/lib/value-guards";
import { Instance_ConnectionState } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type DbConnectionStatus = "connected" | "disconnected" | "error";

interface QualifiedTableName {
  schema: string;
  table: string;
}

interface QualifiedRelationName {
  relation: string;
  schema: string;
}

const byteFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const BYTE_DECIMAL_SCALE = 10;
const BYTES_PER_KIBIBYTE = 1024;
const TABLE_RESOURCE_NAME_PATTERN =
  /^instances\/[^/]+\/databases\/[^/]+\/schemas\/(?<capture1>[^/]+)\/tables\/(?<capture2>[^/]+)$/u;
const RELATION_RESOURCE_NAME_PATTERN =
  /^instances\/[^/]+\/databases\/[^/]+\/schemas\/(?<capture1>[^/]+)\/(?:tables|views)\/(?<capture2>[^/]+)$/u;

function encodeResourceSegment(segment: string) {
  return segment.replaceAll("%", "%25").replaceAll("/", "%2F");
}

function decodeResourceSegment(segment: string) {
  return segment.replaceAll("%2F", "/").replaceAll("%25", "%");
}

function splitResourceName(name: string) {
  return name.split("/").filter((segment) => segment.length > 0);
}

function toTimestamp(value: { seconds?: bigint; nanos?: number }) {
  return create(TimestampSchema, {
    nanos: value.nanos ?? 0,
    seconds: value.seconds ?? 0n,
  });
}

function byteUnitLabel(units: readonly string[], index: number) {
  const unit = units[index];
  if (unit === undefined) {
    throw new RangeError("Invalid byte unit index");
  }
  return unit;
}

export function buildInstanceName(instanceId: string) {
  return `instances/${encodeResourceSegment(instanceId)}`;
}

export function buildDatabaseName(instanceId: string, databaseId: string) {
  return `${buildInstanceName(instanceId)}/databases/${encodeResourceSegment(databaseId)}`;
}

export function buildRoleName(instanceId: string, roleId: string) {
  return `${buildInstanceName(instanceId)}/roles/${roleId}`;
}

export function buildSchemaName(
  instanceId: string,
  databaseId: string,
  schemaId: string
) {
  return `${buildDatabaseName(instanceId, databaseId)}/schemas/${encodeResourceSegment(schemaId)}`;
}

export function buildTableName({
  instanceId,
  databaseId,
  schemaId,
  tableId,
}: {
  instanceId: string;
  databaseId: string;
  schemaId: string;
  tableId: string;
}) {
  return `${buildSchemaName(instanceId, databaseId, schemaId)}/tables/${encodeResourceSegment(tableId)}`;
}

export function buildViewName({
  instanceId,
  databaseId,
  schemaId,
  viewId,
}: {
  instanceId: string;
  databaseId: string;
  schemaId: string;
  viewId: string;
}) {
  return `${buildSchemaName(instanceId, databaseId, schemaId)}/views/${encodeResourceSegment(viewId)}`;
}

export function parseResourceLeafId(name: string) {
  const segments = splitResourceName(name);
  return decodeResourceSegment(segments.at(-1) ?? name);
}

export function parseTableQualifiedName(name: string) {
  const parsed = tryParseTableQualifiedName(name);
  if (!parsed) {
    throw new Error(`invalid table resource name: ${name}`);
  }
  return parsed;
}

export function parseRelationQualifiedName(name: string) {
  const parsed = tryParseRelationQualifiedName(name);
  if (!parsed) {
    throw new Error(`invalid table or view resource name: ${name}`);
  }
  return parsed;
}

export function tryParseRelationQualifiedName(name: string) {
  const match = RELATION_RESOURCE_NAME_PATTERN.exec(name);
  if (
    !(
      isNonEmptyString(match?.[1]) &&
      typeof match[2] === "string" &&
      match[2].length > 0
    )
  ) {
    return undefined;
  }
  return {
    relation: decodeResourceSegment(match[2]),
    schema: decodeResourceSegment(match[1]),
  } satisfies QualifiedRelationName | undefined;
}

export function tryParseTableQualifiedName(name: string) {
  const match = TABLE_RESOURCE_NAME_PATTERN.exec(name);
  if (
    !(
      isNonEmptyString(match?.[1]) &&
      typeof match[2] === "string" &&
      match[2].length > 0
    )
  ) {
    return undefined;
  }
  return {
    schema: decodeResourceSegment(match[1]),
    table: decodeResourceSegment(match[2]),
  } satisfies QualifiedTableName | undefined;
}

export function formatBytes(
  sizeBytes: bigint | number | string | null | undefined
) {
  if (
    sizeBytes === null ||
    sizeBytes === undefined ||
    (typeof sizeBytes === "string" && sizeBytes.trim() === "")
  ) {
    return "—";
  }

  const numeric = Number(sizeBytes);

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

  let rounded =
    unitIndex === 0
      ? Math.round(value)
      : Math.round(value * BYTE_DECIMAL_SCALE) / BYTE_DECIMAL_SCALE;
  if (rounded >= BYTES_PER_KIBIBYTE && unitIndex < units.length - 1) {
    rounded /= BYTES_PER_KIBIBYTE;
    unitIndex += 1;
  }

  return `${byteFormatter.format(rounded)} ${byteUnitLabel(units, unitIndex)}`;
}

export function normalizeEstimatedRowCount(
  value: bigint | number | string | null | undefined
) {
  if (value === null || value === undefined) {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
}

export function toConnectionStatus(state: Instance_ConnectionState) {
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
) {
  if (!timestamp) {
    return "—";
  }

  try {
    return timestampFormatter.format(timestampDate(toTimestamp(timestamp)));
  } catch {
    return "—";
  }
}

export function formatUptime(
  startedAt: { seconds?: bigint; nanos?: number } | null | undefined
) {
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

export type { DbConnectionStatus, QualifiedRelationName, QualifiedTableName };
