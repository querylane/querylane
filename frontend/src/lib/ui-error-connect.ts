import { fromBinary } from "@bufbuild/protobuf";
import { Code, type ConnectError } from "@connectrpc/connect";

import type {
  AppUiErrorDetail,
  AppUiErrorPostgres,
  AppUiErrorResponseContext,
} from "@/lib/ui-error-types";
import {
  CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
  CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER,
  CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER,
  isRecord,
} from "@/lib/ui-error-types";
import { PostgreSqlErrorDetailSchema } from "@/protogen/querylane/console/v1alpha1/errors_pb";

const CONNECT_ERROR_SNAPSHOT_HEADERS = new Set([
  CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
  CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER,
  CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER,
]);

const REDACTED_METADATA_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
]);

const HTTP_STATUS_MESSAGE_PATTERN = /^HTTP \d{3}\b/u;
const HTTP_CLIENT_CLOSED_REQUEST_STATUS = 499;
const NEWLINE_PATTERN = /\r?\n/u;
const OPERATION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_.:-]{0,127}$/u;
const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";
const SQLSTATE_CLASS_PATTERN = /^[0-9A-Z]{2}$/u;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;
const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,79}$/u;

function decodeBase64Bytes(value: string): Uint8Array | null {
  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }

    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    return null;
  }
}

function decodeBase64Utf8(value: string): string | null {
  const bytes = decodeBase64Bytes(value);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

function tryParseJson(
  value: string | null,
  contentType: string | null
): unknown | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const looksLikeJson =
    contentType?.toLowerCase().includes("json") === true ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");
  if (!looksLikeJson) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function getCodeLabel(code: Code | null): string | null {
  if (code === null) {
    return null;
  }

  const label = Code[code];
  return typeof label === "string" ? label : null;
}

function toProtocolCodeString(label: string): string {
  return (
    label[0]?.toLowerCase() +
    label
      .slice(1)
      .replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
  );
}

function getCodeFromProtocolString(value: unknown): Code | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const normalizedValue = value.toLowerCase();
  for (const candidate of Object.values(Code)) {
    if (typeof candidate !== "number") {
      continue;
    }

    const label = getCodeLabel(candidate);
    if (label && toProtocolCodeString(label) === normalizedValue) {
      return candidate;
    }
  }

  return null;
}

function getCodeLabelFromProtocolString(value: unknown): string | null {
  const code = getCodeFromProtocolString(value);
  if (code !== null) {
    return getCodeLabel(code);
  }

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value
    .split("_")
    .map((part) =>
      part.length === 0
        ? part
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    )
    .join("");
}

function isConnectErrorSnapshotHeader(key: string): boolean {
  return CONNECT_ERROR_SNAPSHOT_HEADERS.has(key.toLowerCase());
}

function createVisibleMetadata(metadata: Headers): Headers {
  const visibleMetadata = new Headers();

  metadata.forEach((value, key) => {
    if (isConnectErrorSnapshotHeader(key)) {
      return;
    }

    visibleMetadata.append(key, value);
  });

  return visibleMetadata;
}

function buildDecodedResponseMessage(
  bodyText: string | null,
  contentType: string | null
): string | null {
  if (!bodyText) {
    return null;
  }

  const trimmed = bodyText.trim();
  if (trimmed.length === 0 || trimmed.startsWith("<")) {
    return null;
  }

  const isPlainText =
    contentType === null || contentType.toLowerCase().startsWith("text/plain");
  if (!isPlainText) {
    return null;
  }

  return trimmed.split(NEWLINE_PATTERN, 1)[0] ?? null;
}

function extractResponseContext(
  metadata: Headers
): AppUiErrorResponseContext | null {
  const encodedBody = metadata.get(CONNECT_ERROR_SNAPSHOT_BODY_HEADER);
  const bodyText = encodedBody ? decodeBase64Utf8(encodedBody) : null;
  const contentType =
    metadata.get(CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER) ??
    metadata.get("content-type");
  const bodyJson = tryParseJson(bodyText, contentType);
  const decodedConnectCode = isRecord(bodyJson)
    ? getCodeFromProtocolString(bodyJson["code"])
    : null;
  const decodedConnectCodeLabel = isRecord(bodyJson)
    ? getCodeLabelFromProtocolString(bodyJson["code"])
    : null;
  const decodedConnectDetails = isRecord(bodyJson)
    ? decodeConnectErrorDetailsFromJson(bodyJson["details"])
    : [];
  let decodedConnectMessage: string | null = null;
  if (isRecord(bodyJson)) {
    decodedConnectMessage =
      typeof bodyJson["message"] === "string" ? bodyJson["message"] : null;
  } else {
    decodedConnectMessage = buildDecodedResponseMessage(bodyText, contentType);
  }
  const rawStatus = metadata.get(CONNECT_ERROR_SNAPSHOT_STATUS_HEADER);
  const status =
    rawStatus && Number.isFinite(Number(rawStatus)) ? Number(rawStatus) : null;
  const statusText = metadata.get(CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER);
  const truncated =
    metadata.get(CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER) === "1";

  if (
    bodyText === null &&
    bodyJson === null &&
    contentType === null &&
    decodedConnectCode === null &&
    decodedConnectMessage === null &&
    status === null &&
    !truncated
  ) {
    return null;
  }

  return {
    bodyJson,
    bodyText,
    contentType,
    decodedConnectCode,
    decodedConnectCodeLabel,
    decodedConnectDetails,
    decodedConnectMessage,
    status,
    statusText,
    truncated,
  };
}

function mapHttpStatusToConnectCode(status: number | null | undefined) {
  return status === HTTP_CLIENT_CLOSED_REQUEST_STATUS ? Code.Canceled : null;
}

function normalizeMetadata(metadata: Headers): Record<string, string[]> {
  const entries = new Map<string, string[]>();

  metadata.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = REDACTED_METADATA_KEYS.has(normalizedKey)
      ? "[REDACTED]"
      : value;
    const existing = entries.get(normalizedKey) ?? [];
    existing.push(normalizedValue);
    entries.set(normalizedKey, existing);
  });

  return Object.fromEntries(entries.entries());
}

function shouldPreferDecodedConnectPayload(rawMessage: string): boolean {
  return (
    rawMessage.length === 0 ||
    HTTP_STATUS_MESSAGE_PATTERN.test(rawMessage) ||
    rawMessage.startsWith("unsupported content type") ||
    rawMessage.startsWith("protocol error:")
  );
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

function normalizeSqlstate(value: unknown): string | null {
  return normalizeSafeString(value, SQLSTATE_PATTERN, (input) =>
    input.toUpperCase()
  );
}

function normalizeSqlstateClass(value: unknown): string | null {
  return normalizeSafeString(value, SQLSTATE_CLASS_PATTERN, (input) =>
    input.toUpperCase()
  );
}

function normalizeSafeIdentifier(value: unknown): string | null {
  return normalizeSafeString(value, SAFE_IDENTIFIER_PATTERN);
}

function normalizeOperation(value: unknown): string | null {
  return normalizeSafeString(value, OPERATION_PATTERN);
}

function normalizePostgresRecord(
  record: Record<string, unknown>
): AppUiErrorPostgres | null {
  const sqlstate = normalizeSqlstate(record["sqlstate"]);
  const sqlstateClass =
    normalizeSqlstateClass(
      record["sqlstateClass"] ?? record["sqlstate_class"]
    ) ?? (sqlstate ? sqlstate.slice(0, 2) : null);
  const conditionName = normalizeSafeIdentifier(
    record["conditionName"] ?? record["condition_name"]
  );
  const operation = normalizeOperation(record["operation"]);

  if (sqlstate === null && sqlstateClass === null && conditionName === null) {
    return null;
  }

  return {
    conditionName,
    operation,
    sqlstate,
    sqlstateClass,
  };
}

function mergePostgresMetadata(
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
    operation: primary.operation ?? fallback.operation,
    sqlstate: primary.sqlstate ?? fallback.sqlstate,
    sqlstateClass: primary.sqlstateClass ?? fallback.sqlstateClass,
  };
}

function decodePostgresBinary(
  value: Uint8Array | undefined
): AppUiErrorPostgres | null {
  if (!value || value.length === 0) {
    return null;
  }

  try {
    return normalizePostgresRecord(
      fromBinary(PostgreSqlErrorDetailSchema, value)
    );
  } catch {
    return null;
  }
}

function extractPostgresFromDebug(
  type: string,
  debug: unknown
): AppUiErrorPostgres | null {
  if (type === POSTGRES_DETAIL_TYPE && isRecord(debug)) {
    return normalizePostgresRecord(debug);
  }

  if (
    type === "google.rpc.ErrorInfo" &&
    isRecord(debug) &&
    isRecord(debug["metadata"])
  ) {
    return normalizePostgresRecord(debug["metadata"]);
  }

  return null;
}

function extractPostgresDetail(input: {
  debug?: unknown | undefined;
  type: string;
  value?: Uint8Array | undefined;
}): AppUiErrorPostgres | null {
  return mergePostgresMetadata(
    input.type === POSTGRES_DETAIL_TYPE
      ? decodePostgresBinary(input.value)
      : null,
    extractPostgresFromDebug(input.type, input.debug)
  );
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

function summarizeBadRequest(detail: { debug?: unknown }): string | null {
  if (!isRecord(detail.debug)) {
    return null;
  }

  const fieldViolations = detail.debug["fieldViolations"];
  if (!(Array.isArray(fieldViolations) && fieldViolations.length > 0)) {
    return null;
  }

  const violations = fieldViolations.flatMap((violation) => {
    if (!isRecord(violation)) {
      return [];
    }

    const field =
      typeof violation["field"] === "string" ? violation["field"] : "request";
    const description =
      typeof violation["description"] === "string"
        ? violation["description"]
        : "validation failed";

    return [`${field}: ${description}`];
  });

  return violations.length > 0 ? violations.join("; ") : null;
}

function summarizeErrorInfo(detail: { debug?: unknown }): string | null {
  if (!isRecord(detail.debug)) {
    return null;
  }

  return typeof detail.debug["reason"] === "string"
    ? detail.debug["reason"]
    : null;
}

function summarizeResourceInfo(detail: { debug?: unknown }): string | null {
  if (!isRecord(detail.debug)) {
    return null;
  }

  const resourceType =
    typeof detail.debug["resourceType"] === "string"
      ? detail.debug["resourceType"]
      : "resource";
  const resourceName =
    typeof detail.debug["resourceName"] === "string"
      ? detail.debug["resourceName"]
      : "unknown";

  return `${resourceType}: ${resourceName}`;
}

function summarizeHelp(detail: { debug?: unknown }): string | null {
  if (!isRecord(detail.debug)) {
    return null;
  }

  const links = detail.debug["links"];
  return Array.isArray(links) && links.length > 0
    ? "Help links available"
    : null;
}

function summarizeKnownDetail(detail: {
  debug?: unknown | undefined;
  type: string;
}): string | null {
  if (detail.type === "google.rpc.BadRequest") {
    return summarizeBadRequest(detail);
  }

  if (detail.type === "google.rpc.ErrorInfo") {
    return summarizeErrorInfo(detail);
  }

  if (detail.type === "google.rpc.ResourceInfo") {
    return summarizeResourceInfo(detail);
  }

  if (detail.type === "google.rpc.Help") {
    return summarizeHelp(detail);
  }

  return null;
}

function summarizeDetail(detail: {
  debug?: unknown | undefined;
  postgres?: AppUiErrorPostgres | null | undefined;
  type: string;
  value?: Uint8Array | undefined;
}): string {
  if (detail.postgres) {
    return summarizePostgres(detail.postgres);
  }

  const knownSummary = summarizeKnownDetail(detail);
  if (knownSummary) {
    return knownSummary;
  }

  if (detail.debug !== undefined) {
    return "Structured detail available";
  }

  if (detail.value && detail.value.length > 0) {
    return "Binary detail available but no debug payload";
  }

  return "No debug payload available";
}

function normalizeIncomingDetail(input: {
  debug?: unknown | undefined;
  type: string;
  value?: Uint8Array | undefined;
  valueLength?: number | undefined;
}): AppUiErrorDetail {
  const postgres = extractPostgresDetail({
    debug: input.debug,
    type: input.type,
    value: input.value,
  });
  const valueLength = input.value?.length ?? input.valueLength ?? 0;

  return {
    debug: input.debug,
    hasRawValue: valueLength > 0,
    postgres: postgres ?? undefined,
    summary: summarizeDetail({
      debug: input.debug,
      postgres,
      type: input.type,
      value:
        valueLength > 0
          ? (input.value ?? new Uint8Array(valueLength))
          : undefined,
    }),
    type: input.type,
  };
}

function normalizeDetails(connectError: ConnectError): AppUiErrorDetail[] {
  return connectError.details.map((detail) => {
    if ("desc" in detail) {
      const postgres =
        detail.desc.typeName === POSTGRES_DETAIL_TYPE && isRecord(detail.value)
          ? normalizePostgresRecord(detail.value)
          : null;
      return {
        debug: detail.value,
        hasRawValue: false,
        postgres: postgres ?? undefined,
        summary: postgres
          ? summarizePostgres(postgres)
          : "Outgoing detail attached locally",
        type: detail.desc.typeName,
      };
    }

    return normalizeIncomingDetail({
      debug: detail.debug,
      type: detail.type,
      value: detail.value,
      valueLength: detail.value.length,
    });
  });
}

function decodeConnectErrorDetailsFromJson(input: unknown): AppUiErrorDetail[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((detail) => {
    if (
      !isRecord(detail) ||
      typeof detail["type"] !== "string" ||
      (detail["value"] !== undefined && typeof detail["value"] !== "string")
    ) {
      return [];
    }

    const encodedValue = detail["value"];
    const decodedValue =
      typeof encodedValue === "string" ? decodeBase64Bytes(encodedValue) : null;

    return [
      normalizeIncomingDetail({
        debug: detail["debug"],
        type: detail["type"],
        value: decodedValue ?? undefined,
        valueLength: typeof encodedValue === "string" ? encodedValue.length : 0,
      }),
    ];
  });
}

function extractErrorInfo(details: AppUiErrorDetail[]): {
  domain: string | null;
  reason: string | null;
} {
  for (const detail of details) {
    if (detail.type !== "google.rpc.ErrorInfo" || !isRecord(detail.debug)) {
      continue;
    }

    const domain =
      typeof detail.debug["domain"] === "string"
        ? detail.debug["domain"]
        : null;
    const reason =
      typeof detail.debug["reason"] === "string"
        ? detail.debug["reason"]
        : null;

    return {
      domain,
      reason,
    };
  }

  return {
    domain: null,
    reason: null,
  };
}

function extractPostgres(
  details: AppUiErrorDetail[]
): AppUiErrorPostgres | null {
  return details.reduce<AppUiErrorPostgres | null>(
    (postgres, detail) =>
      mergePostgresMetadata(postgres, detail.postgres ?? null),
    null
  );
}

function normalizeConnectErrorState(
  connectError: ConnectError | null,
  rawMessage: string
): {
  code: Code | null;
  codeLabel: string | null;
  details: AppUiErrorDetail[];
  domain: string | null;
  message: string;
  metadata: Record<string, string[]>;
  postgres: AppUiErrorPostgres | null;
  reason: string | null;
  response: AppUiErrorResponseContext | null;
} {
  if (connectError === null) {
    return {
      code: null,
      codeLabel: null,
      details: [],
      domain: null,
      message: rawMessage.length > 0 ? rawMessage : "Unknown error",
      metadata: {},
      postgres: null,
      reason: null,
      response: null,
    };
  }

  const response = extractResponseContext(connectError.metadata);
  const normalizedDetails = normalizeDetails(connectError);
  const details =
    normalizedDetails.length > 0
      ? normalizedDetails
      : (response?.decodedConnectDetails ?? []);
  const preferDecodedConnectPayload =
    response !== null && shouldPreferDecodedConnectPayload(rawMessage);
  const responseCode = mapHttpStatusToConnectCode(response?.status);
  const code =
    preferDecodedConnectPayload && response.decodedConnectCode !== null
      ? response.decodedConnectCode
      : (responseCode ?? connectError.code);
  const codeLabel =
    getCodeLabel(code) ??
    (preferDecodedConnectPayload
      ? (response?.decodedConnectCodeLabel ?? null)
      : null);
  const { domain, reason } = extractErrorInfo(details);
  const postgres = extractPostgres(details);
  const messageCandidate = preferDecodedConnectPayload
    ? (response?.decodedConnectMessage ?? rawMessage)
    : rawMessage;

  return {
    code,
    codeLabel,
    details,
    domain,
    message: messageCandidate.length > 0 ? messageCandidate : "Unknown error",
    metadata: normalizeMetadata(createVisibleMetadata(connectError.metadata)),
    postgres,
    reason,
    response,
  };
}

export { normalizeConnectErrorState };
