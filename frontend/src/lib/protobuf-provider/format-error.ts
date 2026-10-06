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

export function grpcCodeLabel(code: number): string {
  return CODE_LABELS[code] ?? `code_${code}`;
}

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

export function extractFieldViolations(error: ConnectError): FieldViolation[] {
  const violations: FieldViolation[] = [];
  try {
    for (const badRequest of error.findDetails(BadRequestSchema)) {
      for (const v of badRequest.fieldViolations) {
        violations.push({ description: v.description, field: v.field });
      }
    }
  } catch {
    return violations;
  }
  return violations;
}

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
  code?: string;
  debug?: { detail?: string; stackEntries?: string[] };
  domain?: string;
  helpLinks: HelpLink[];
  message?: string;
  messageLocale?: string;
  metadata?: Record<string, string>;
  preconditionViolations: PreconditionViolation[];
  quotaViolations: QuotaViolation[];
  reason?: string;
  requestId?: string;
  resource?: {
    name?: string | undefined;
    type?: string | undefined;
    description?: string | undefined;
  };
  retryAfterSeconds?: number;
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
        return typeName !== undefined && typeName !== "" && !MAPPED_DETAIL_TYPES.has(typeName) ? [typeName] : [];
      })
    ),
  ];

  try {
    for (const localized of error.findDetails(LocalizedMessageSchema)) {
      if (localized.message) {
        context.message = localized.message;
        if (localized.locale) {
          context.messageLocale = localized.locale;
        }
      }
    }

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
        if (metaReq && !(context.requestId !== undefined && context.requestId !== "")) {
          context.requestId = metaReq;
        }
      }
    }

    for (const req of error.findDetails(RequestInfoSchema)) {
      if (req.requestId) {
        context.requestId = req.requestId;
      }
    }

    for (const retry of error.findDetails(RetryInfoSchema)) {
      if (retry.retryDelay) {
        const { nanos, seconds: retrySeconds } = retry.retryDelay;
        const seconds = Number(retrySeconds);
        context.retryAfterSeconds = seconds + nanos / 1e9;
      }
    }

    for (const dbg of error.findDetails(DebugInfoSchema)) {
      context.debug = { detail: dbg.detail, stackEntries: dbg.stackEntries };
    }

    for (const pre of error.findDetails(PreconditionFailureSchema)) {
      for (const v of pre.violations) {
        context.preconditionViolations.push({
          description: v.description,
          subject: v.subject,
          type: v.type,
        });
      }
    }

    for (const quota of error.findDetails(QuotaFailureSchema)) {
      for (const v of quota.violations) {
        context.quotaViolations.push({
          description: v.description,
          subject: v.subject,
        });
      }
    }

    for (const resource of error.findDetails(ResourceInfoSchema)) {
      context.resource = {
        description: resource.description || undefined,
        name: resource.resourceName || undefined,
        type: resource.resourceType || undefined,
      };
    }
  } catch {
    return context;
  }

  return context;
}
