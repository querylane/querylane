import { fromBinary } from "@bufbuild/protobuf";
import { Code, type ConnectError } from "@connectrpc/connect";

import type {
  AppUiErrorDetail,
  AppUiErrorPostgres,
} from "@/lib/ui-error-types";
import { isRecord } from "@/lib/ui-error-types";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const REDACTED_METADATA_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
]);
const HTTP_CLIENT_CLOSED_REQUEST_PATTERN = /^HTTP 499\b/u;
const OPERATION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_.:-]{0,127}$/u;
const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";
const SQLSTATE_CLASS_PATTERN = /^[0-9A-Z]{2}$/u;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;
const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,79}$/u;

function getCodeLabel(code: Code | null): string | null {
  if (code === null) {
    return null;
  }

  const label = Code[code];
  return typeof label === "string" ? label : null;
}

function normalizeMetadata(metadata: Headers): Record<string, string[]> {
  const entries = new Map<string, string[]>();
  metadata.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = REDACTED_METADATA_KEYS.has(normalizedKey)
      ? "[REDACTED]"
      : value;
    entries.set(normalizedKey, [
      ...(entries.get(normalizedKey) ?? []),
      normalizedValue,
    ]);
  });
  return Object.fromEntries(entries.entries());
}

function normalizeSafeString(
  value: unknown,
  pattern: RegExp,
  transform: (input: string) => string = (input) => input
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = transform(value.trim());
  return pattern.test(normalizedValue) ? normalizedValue : null;
}

function normalizeServerFields(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, fieldValue]) =>
      typeof fieldValue === "string" ? [[key, fieldValue]] : []
    )
  );
}

function normalizePostgresRecord(
  record: Record<string, unknown>,
  typedDetail: boolean
): AppUiErrorPostgres | null {
  const sqlstate = normalizeSafeString(
    record["sqlstate"],
    SQLSTATE_PATTERN,
    (input) => input.toUpperCase()
  );
  const sqlstateClass =
    normalizeSafeString(
      record["sqlstateClass"] ?? record["sqlstate_class"],
      SQLSTATE_CLASS_PATTERN,
      (input) => input.toUpperCase()
    ) ?? (sqlstate ? sqlstate.slice(0, 2) : null);
  const conditionName = normalizeSafeString(
    record["conditionName"] ?? record["condition_name"],
    SAFE_IDENTIFIER_PATTERN
  );
  const operation = normalizeSafeString(record["operation"], OPERATION_PATTERN);

  if (!(typedDetail || sqlstate || sqlstateClass || conditionName)) {
    return null;
  }

  const rawKind = record["kind"];
  const rawRetryGuidance = record["retryGuidance"] ?? record["retry_guidance"];

  return {
    conditionName,
    kind:
      typeof rawKind === "number"
        ? (rawKind as PostgreSqlErrorKind)
        : PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNSPECIFIED,
    operation,
    retryGuidance:
      typeof rawRetryGuidance === "number"
        ? (rawRetryGuidance as PostgreSqlErrorRetryGuidance)
        : PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_UNSPECIFIED,
    serverFields: normalizeServerFields(
      record["serverFields"] ?? record["server_fields"]
    ),
    sqlstate,
    sqlstateClass,
  };
}

function mergePostgres(
  primary: AppUiErrorPostgres | null,
  fallback: AppUiErrorPostgres | null
): AppUiErrorPostgres | null {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }

  return {
    conditionName: primary.conditionName ?? fallback.conditionName,
    kind: primary.kind,
    operation: primary.operation ?? fallback.operation,
    retryGuidance: primary.retryGuidance,
    serverFields: primary.serverFields,
    sqlstate: primary.sqlstate ?? fallback.sqlstate,
    sqlstateClass: primary.sqlstateClass ?? fallback.sqlstateClass,
  };
}

function decodePostgresBinary(value: Uint8Array): AppUiErrorPostgres | null {
  if (value.length === 0) {
    return null;
  }

  try {
    return normalizePostgresRecord(
      fromBinary(PostgreSqlErrorDetailSchema, value),
      true
    );
  } catch {
    return null;
  }
}

function extractPostgresDetail(input: {
  debug?: unknown | undefined;
  type: string;
  value?: Uint8Array | undefined;
}): AppUiErrorPostgres | null {
  if (input.type === POSTGRES_DETAIL_TYPE) {
    return mergePostgres(
      input.value ? decodePostgresBinary(input.value) : null,
      isRecord(input.debug) ? normalizePostgresRecord(input.debug, true) : null
    );
  }

  if (
    input.type === "google.rpc.ErrorInfo" &&
    isRecord(input.debug) &&
    isRecord(input.debug["metadata"])
  ) {
    return normalizePostgresRecord(input.debug["metadata"], false);
  }

  return null;
}

function summarizePostgres(postgres: AppUiErrorPostgres): string {
  if (postgres.sqlstate && postgres.conditionName) {
    return `SQLSTATE ${postgres.sqlstate} ${postgres.conditionName}`;
  }
  if (postgres.sqlstate) {
    return `SQLSTATE ${postgres.sqlstate}`;
  }
  if (postgres.conditionName) {
    return `PostgreSQL ${postgres.conditionName}`;
  }
  return "PostgreSQL error detail available";
}

function summarizeDetail(
  type: string,
  debug: unknown,
  postgres: AppUiErrorPostgres | null
) {
  if (postgres) {
    return summarizePostgres(postgres);
  }
  if (type === "google.rpc.ErrorInfo" && isRecord(debug)) {
    return typeof debug["reason"] === "string"
      ? debug["reason"]
      : "Structured detail available";
  }
  return debug === undefined
    ? "Binary detail available"
    : "Structured detail available";
}

function normalizeDetails(connectError: ConnectError): AppUiErrorDetail[] {
  return connectError.details.map((detail) => {
    if ("desc" in detail) {
      const postgres =
        detail.desc.typeName === POSTGRES_DETAIL_TYPE && isRecord(detail.value)
          ? normalizePostgresRecord(detail.value, true)
          : null;
      return {
        debug: detail.value,
        postgres: postgres ?? undefined,
        summary: postgres
          ? summarizePostgres(postgres)
          : "Outgoing detail attached locally",
        type: detail.desc.typeName,
      };
    }

    const postgres = extractPostgresDetail(detail);
    return {
      debug: detail.debug,
      postgres: postgres ?? undefined,
      summary: summarizeDetail(detail.type, detail.debug, postgres),
      type: detail.type,
    };
  });
}

function extractErrorInfo(details: AppUiErrorDetail[]) {
  for (const detail of details) {
    if (detail.type !== "google.rpc.ErrorInfo" || !isRecord(detail.debug)) {
      continue;
    }
    return {
      domain:
        typeof detail.debug["domain"] === "string"
          ? detail.debug["domain"]
          : null,
      reason:
        typeof detail.debug["reason"] === "string"
          ? detail.debug["reason"]
          : null,
    };
  }
  return { domain: null, reason: null };
}

function extractPostgres(
  details: AppUiErrorDetail[]
): AppUiErrorPostgres | null {
  const typedDetail = details.find(
    (detail) => detail.type === POSTGRES_DETAIL_TYPE
  );
  if (typedDetail) {
    const errorInfo = details.find(
      (detail) => detail.type === "google.rpc.ErrorInfo"
    )?.postgres;
    const typed = typedDetail.postgres ?? {
      conditionName: null,
      kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNSPECIFIED,
      operation: null,
      retryGuidance:
        PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_UNSPECIFIED,
      serverFields: {},
      sqlstate: null,
      sqlstateClass: null,
    };
    return mergePostgres(typed, errorInfo ?? null);
  }

  return (
    details.find((detail) => detail.postgres !== undefined)?.postgres ?? null
  );
}

function normalizeConnectErrorState(
  connectError: ConnectError | null,
  rawMessage: string
) {
  if (connectError === null) {
    return {
      code: null,
      codeLabel: null,
      details: [] as AppUiErrorDetail[],
      domain: null,
      message: rawMessage.length > 0 ? rawMessage : "Unknown error",
      metadata: {} as Record<string, string[]>,
      postgres: null,
      reason: null,
    };
  }

  const details = normalizeDetails(connectError);
  const code = HTTP_CLIENT_CLOSED_REQUEST_PATTERN.test(rawMessage)
    ? Code.Canceled
    : connectError.code;
  const { domain, reason } = extractErrorInfo(details);

  return {
    code,
    codeLabel: getCodeLabel(code),
    details,
    domain,
    message: rawMessage.length > 0 ? rawMessage : "Unknown error",
    metadata: normalizeMetadata(connectError.metadata),
    postgres: extractPostgres(details),
    reason,
  };
}

export { normalizeConnectErrorState };
