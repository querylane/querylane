import {
  BadRequestSchema,
  DebugInfoSchema,
  ErrorInfoSchema,
  HelpSchema,
  LocalizedMessageSchema,
  PreconditionFailureSchema,
  QuotaFailureSchema,
  RequestInfoSchema,
  ResourceInfoSchema,
  RetryInfoSchema,
} from "@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb.js";
import { Code, ConnectError } from "@connectrpc/connect";

const CODE_LABELS: Record<number, string> = {
  [Code.Canceled]: "canceled",
  [Code.Unknown]: "unknown",
  [Code.InvalidArgument]: "invalid_argument",
  [Code.DeadlineExceeded]: "deadline_exceeded",
  [Code.NotFound]: "not_found",
  [Code.AlreadyExists]: "already_exists",
  [Code.PermissionDenied]: "permission_denied",
  [Code.ResourceExhausted]: "resource_exhausted",
  [Code.FailedPrecondition]: "failed_precondition",
  [Code.Aborted]: "aborted",
  [Code.OutOfRange]: "out_of_range",
  [Code.Unimplemented]: "unimplemented",
  [Code.Internal]: "internal",
  [Code.Unavailable]: "unavailable",
  [Code.DataLoss]: "data_loss",
  [Code.Unauthenticated]: "unauthenticated",
};

/**
 * Get a human-readable label for a gRPC status code.
 */
export function grpcCodeLabel(code: number): string {
  return CODE_LABELS[code] ?? `code_${code}`;
}

/**
 * Extract a human-readable message from a Connect/gRPC error.
 * Preserves all available information: message, field violations, and gRPC code.
 */
export function formatConnectError(error: unknown): string {
  if (error instanceof ConnectError) {
    const violations = extractFieldViolations(error);
    const { code, rawMessage } = error;
    const codeLabel = grpcCodeLabel(code);

    const parts: string[] = [];
    if (rawMessage) {
      parts.push(rawMessage);
    }
    if (violations.length > 0) {
      parts.push(violations.map((v) => `${v.field}: ${v.description}`).join("; "));
    }
    if (parts.length === 0) {
      return codeLabel;
    }
    return `${parts.join(" — ")} (code: ${codeLabel})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface FieldViolation {
  description: string;
  field: string;
}

/**
 * Extract field violations from Connect error details via the generated
 * `google.rpc.BadRequest` schema. Returns an empty array when no
 * BadRequest detail is attached or parsing fails.
 */
export function extractFieldViolations(error: ConnectError): FieldViolation[] {
  const violations: FieldViolation[] = [];
  try {
    for (const badRequest of error.findDetails(BadRequestSchema)) {
      for (const v of badRequest.fieldViolations) {
        violations.push({ description: v.description, field: v.field });
      }
    }
  } catch {
    // Unexpected parse failure: fall through to empty.
  }
  return violations;
}

/**
 * Format a toast error message for API operations.
 * Pattern: "Failed to {action} {entity}: {formatted error with code}"
 */
export function formatToastErrorMessage({
  action,
  entity,
  error,
}: {
  action: string;
  entity: string;
  error: unknown;
}): string {
  return `Failed to ${action} ${entity}: ${formatConnectError(error)}`;
}

export interface HelpLink {
  description: string;
  url: string;
}

export interface PreconditionViolation {
  description: string;
  subject: string;
  type: string;
}

export interface QuotaViolation {
  description: string;
  subject: string;
}

export interface ConnectErrorContext {
  /** gRPC status code label (e.g. "invalid_argument"). Always populated for ConnectError. */
  code?: string;
  /** Dev-only stack frames / detail from google.rpc.DebugInfo. */
  debug?: { detail?: string; stackEntries?: string[] };
  /** Service domain from `google.rpc.ErrorInfo`. */
  domain?: string;
  /** Links the backend suggests the user follow (docs, status pages). */
  helpLinks: HelpLink[];
  /** Human-friendly top-level message. Prefers `LocalizedMessage.message` over `rawMessage`. */
  message?: string;
  /** Locale of the localized message if one was provided. */
  messageLocale?: string;
  /** Extra ErrorInfo metadata the server attached. */
  metadata?: Record<string, string>;
  /** Precondition failures (typed, not per-field). */
  preconditionViolations: PreconditionViolation[];
  /** Quota failures. */
  quotaViolations: QuotaViolation[];
  /** Domain-scoped machine reason from `google.rpc.ErrorInfo` (useful for logs/telemetry). */
  reason?: string;
  /** Opaque request identifier for support tickets. */
  requestId?: string;
  /** Affected resource, if reported. */
  resource?: {
    name?: string | undefined;
    type?: string | undefined;
    description?: string | undefined;
  };
  /** Retry hint in seconds. Set on rate-limit / resource-exhausted responses. */
  retryAfterSeconds?: number;
  /** Detail type names not interpreted by Protoform, preserved for fallback UI and telemetry. */
  unmappedDetails: string[];
}

const MAPPED_DETAIL_TYPES: ReadonlySet<string> = new Set([
  BadRequestSchema.typeName,
  DebugInfoSchema.typeName,
  ErrorInfoSchema.typeName,
  HelpSchema.typeName,
  LocalizedMessageSchema.typeName,
  PreconditionFailureSchema.typeName,
  QuotaFailureSchema.typeName,
  RequestInfoSchema.typeName,
  ResourceInfoSchema.typeName,
  RetryInfoSchema.typeName,
]);

function connectDetailTypeName(detail: ConnectError["details"][number]): string | undefined {
  if ("desc" in detail) {
    return detail.desc.typeName;
  }
  return detail.type || undefined;
}

/**
 * Extract every surfacable detail from a `ConnectError` into one context object.
 * Non-ConnectError inputs yield an empty context (safe to render). All fields
 * optional; callers render only the pieces that are present.
 *
 * Uses `ConnectError.findDetails(Schema)` with the generated google.rpc.*
 * schemas so we don't hand-walk wire-format JSON. Types come from the proto
 * source of truth and handle both `value` (binary) and `debug` (JSON)
 * representations the Connect runtime surfaces.
 */
export function extractConnectErrorContext(error: unknown): ConnectErrorContext {
  const context: ConnectErrorContext = {
    helpLinks: [],
    preconditionViolations: [],
    quotaViolations: [],
    unmappedDetails: [],
  };

  if (!(error instanceof ConnectError)) {
    return context;
  }

  context.code = grpcCodeLabel(error.code);
  if (error.rawMessage) {
    context.message = error.rawMessage;
  }
  context.unmappedDetails = [
    ...new Set(
      error.details.flatMap((detail) => {
        const typeName = connectDetailTypeName(detail);
        return typeName && !MAPPED_DETAIL_TYPES.has(typeName) ? [typeName] : [];
      })
    ),
  ];

  try {
    // LocalizedMessage overrides rawMessage when present, carries locale.
    for (const localized of error.findDetails(LocalizedMessageSchema)) {
      if (localized.message) {
        context.message = localized.message;
        if (localized.locale) {
          context.messageLocale = localized.locale;
        }
      }
    }

    // Help: docs / status links the backend suggests.
    for (const help of error.findDetails(HelpSchema)) {
      for (const link of help.links) {
        if (link.url) {
          context.helpLinks.push({
            description: link.description || link.url,
            url: link.url,
          });
        }
      }
    }

    // ErrorInfo: machine reason/domain for telemetry, plus metadata (request_id stash).
    for (const info of error.findDetails(ErrorInfoSchema)) {
      if (info.reason) {
        context.reason = info.reason;
      }
      if (info.domain) {
        context.domain = info.domain;
      }
      const metaKeys = Object.keys(info.metadata);
      if (metaKeys.length > 0) {
        context.metadata = { ...info.metadata };
        const metaReq = info.metadata["request_id"] ?? info.metadata["requestId"];
        if (metaReq && !context.requestId) {
          context.requestId = metaReq;
        }
      }
    }

    // RequestInfo: explicit request id (takes precedence over ErrorInfo.metadata).
    for (const req of error.findDetails(RequestInfoSchema)) {
      if (req.requestId) {
        context.requestId = req.requestId;
      }
    }

    // RetryInfo: seconds-until-retry hint. google.protobuf.Duration has
    // `seconds: bigint` + `nanos: number` in proto v2 generated types.
    for (const retry of error.findDetails(RetryInfoSchema)) {
      if (retry.retryDelay) {
        const { nanos, seconds: retrySeconds } = retry.retryDelay;
        const seconds = Number(retrySeconds);
        context.retryAfterSeconds = seconds + nanos / 1e9;
      }
    }

    // DebugInfo: dev-only stack trace / detail.
    for (const dbg of error.findDetails(DebugInfoSchema)) {
      context.debug = { detail: dbg.detail, stackEntries: dbg.stackEntries };
    }

    // PreconditionFailure: typed violations (TOS, plan, etc.).
    for (const pre of error.findDetails(PreconditionFailureSchema)) {
      for (const v of pre.violations) {
        context.preconditionViolations.push({
          description: v.description,
          subject: v.subject,
          type: v.type,
        });
      }
    }

    // QuotaFailure: quota exhaustion details.
    for (const quota of error.findDetails(QuotaFailureSchema)) {
      for (const v of quota.violations) {
        context.quotaViolations.push({
          description: v.description,
          subject: v.subject,
        });
      }
    }

    // ResourceInfo: affected resource descriptor.
    for (const resource of error.findDetails(ResourceInfoSchema)) {
      context.resource = {
        description: resource.description || undefined,
        name: resource.resourceName || undefined,
        type: resource.resourceType || undefined,
      };
    }
  } catch {
    // Malformed details: fall through with whatever we extracted so far.
  }

  return context;
}
