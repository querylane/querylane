import { ConnectError } from "@connectrpc/connect";
import {
  buildGrpcurlRequestLines,
  buildTranscriptDetailValue,
  hasRequestContext,
} from "@/lib/ui-error-reproduction";
import type {
  AppErrorSource,
  AppUiError,
  AppUiErrorContext,
  AppUiErrorDetail,
  AppUiErrorPostgres,
  AppUiErrorTechnicalDetailsObject,
  AppUiErrorTechnicalSection,
  BlockingErrorReason,
} from "@/lib/ui-error-types";
import { isRecord } from "@/lib/ui-error-types";

const TECHNICAL_DETAILS_INDENT_SIZE = 4;
const HTML_DOCUMENT_PATTERN = /^\s*(?:<!DOCTYPE\s+html|<html|<head|<body)/iu;
const XML_DOCUMENT_PATTERN = /^\s*<\?xml\b/u;

function inferLanguageFromContentType(
  contentType: string | null
): string | null {
  if (!contentType) {
    return null;
  }

  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalized.includes("json")) {
    return "json";
  }
  if (normalized.includes("html") || normalized.includes("xhtml")) {
    return "html";
  }
  if (normalized.includes("xml") || normalized.includes("svg")) {
    return "xml";
  }
  if (normalized.includes("yaml") || normalized.includes("yml")) {
    return "yaml";
  }

  return null;
}

function inferTextLanguage(
  content: string,
  contentType?: string | null
): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "text";
  }

  const fromContentType = inferLanguageFromContentType(contentType ?? null);
  if (fromContentType) {
    return fromContentType;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // not JSON
    }
  }

  if (HTML_DOCUMENT_PATTERN.test(trimmed)) {
    return "html";
  }

  if (XML_DOCUMENT_PATTERN.test(trimmed)) {
    return "xml";
  }

  return "text";
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return {
      message: cause.message,
      name: cause.name,
      stack: cause.stack ?? null,
    };
  }

  if (isRecord(cause)) {
    return Object.fromEntries(
      Object.entries(cause).map(([key, value]) => [key, serializeCause(value)])
    );
  }

  return cause ?? null;
}

function resolveUnderlyingCause(error: unknown): unknown {
  if (error instanceof ConnectError) {
    return error.cause;
  }

  if (error instanceof Error) {
    return error.cause;
  }

  return null;
}

function formatJsonBlockLines(value: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `${prefix}${line}`);
}

function formatNumberedJsonBlock(index: number, value: unknown): string[] {
  const label = `${index + 1})`;
  const firstLinePrefix = `  ${label} `;
  const continuationPrefix = " ".repeat(firstLinePrefix.length);
  const jsonLines = JSON.stringify(value, null, 2).split("\n");

  return [
    `${firstLinePrefix}${jsonLines[0]}`,
    ...jsonLines.slice(1).map((line) => `${continuationPrefix}${line}`),
  ];
}

function buildContextDump(
  context: AppUiErrorContext
): AppUiErrorTechnicalDetailsObject | null {
  const requestContext = hasRequestContext(context.request)
    ? context.request
    : undefined;
  const normalizedContext: Record<string, unknown> = {};

  if (context.action) {
    normalizedContext["action"] = context.action;
  }
  if (context.area) {
    normalizedContext["area"] = context.area;
  }
  if (context.endpoint) {
    normalizedContext["endpoint"] = context.endpoint;
  }
  if (context.componentStack) {
    normalizedContext["componentStack"] = context.componentStack;
  }
  if (requestContext) {
    normalizedContext["request"] = requestContext;
  }
  if (context.response) {
    normalizedContext["response"] = context.response;
  }
  if (context.routeId) {
    normalizedContext["routeId"] = context.routeId;
  }
  if (context.source) {
    normalizedContext["source"] = context.source;
  }
  if (context.stepDisplayName) {
    normalizedContext["stepDisplayName"] = context.stepDisplayName;
  }
  if (context.stepId !== undefined) {
    normalizedContext["stepId"] = context.stepId;
  }
  if (context.surface) {
    normalizedContext["surface"] = context.surface;
  }

  return Object.keys(normalizedContext).length > 0 ? normalizedContext : null;
}

function buildTechnicalDetailsObject(input: {
  blockingReason: BlockingErrorReason | null;
  codeLabel: string | null;
  connectDomain: string | null;
  connectReason: string | null;
  context: AppUiErrorContext;
  details: AppUiErrorDetail[];
  manualRetryable: boolean;
  message: string;
  metadata: Record<string, string[]>;
  postgres: AppUiErrorPostgres | null;
  rawMessage: string;
  retryGuidance: string | null;
  source: AppErrorSource;
  stack: string | null;
  title: string;
  underlyingCause: unknown;
}): AppUiErrorTechnicalDetailsObject {
  return {
    blockingReason: input.blockingReason,
    code: input.codeLabel,
    connect: {
      domain: input.connectDomain,
      reason: input.connectReason,
    },
    context: input.context,
    details: input.details,
    manualRetryable: input.manualRetryable,
    message: input.message,
    metadata: input.metadata,
    postgres: input.postgres,
    rawMessage: input.rawMessage,
    retryable: input.manualRetryable,
    retryGuidance: input.retryGuidance,
    source: input.source,
    stack: input.stack,
    title: input.title,
    underlyingCause: serializeCause(input.underlyingCause),
  };
}

function appendConnectDetails(lines: string[], details: AppUiErrorDetail[]) {
  if (details.length === 0) {
    return;
  }

  lines.push("  Details:");
  for (const [index, detail] of details.entries()) {
    lines.push(
      ...formatNumberedJsonBlock(index, buildTranscriptDetailValue(detail))
    );
  }
}

function appendConnectMetadata(
  lines: string[],
  metadata: Record<string, string[]>
) {
  const metadataEntries = Object.entries(metadata).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (metadataEntries.length === 0) {
    return;
  }

  lines.push("  Metadata:");
  for (const [key, values] of metadataEntries) {
    if (values.length === 1) {
      lines.push(`    ${key}: ${values[0]}`);
      continue;
    }

    lines.push(`    ${key}: ${JSON.stringify(values)}`);
  }
}

function appendConnectResponseBody(
  lines: string[],
  response: AppUiErrorContext["response"]
) {
  if (!response?.bodyText) {
    return;
  }

  lines.push("  Response body:");

  if (response.bodyJson === null) {
    lines.push(
      ...response.bodyText
        .split("\n")
        .map((line) => `${" ".repeat(TECHNICAL_DETAILS_INDENT_SIZE)}${line}`)
    );
  } else {
    lines.push(
      ...formatJsonBlockLines(response.bodyJson, TECHNICAL_DETAILS_INDENT_SIZE)
    );
  }

  if (response.truncated) {
    lines.push(
      `${" ".repeat(TECHNICAL_DETAILS_INDENT_SIZE)}[response snapshot truncated]`
    );
  }
}

function buildConnectTechnicalDetailsText(input: {
  codeLabel: string | null;
  context: AppUiErrorContext;
  details: AppUiErrorDetail[];
  metadata: Record<string, string[]>;
  message: string;
  postgres: AppUiErrorPostgres | null;
  rawMessage: string;
  retryGuidance: string | null;
}) {
  const lines = buildGrpcurlRequestLines(input.context.request);

  lines.push("ERROR:");
  lines.push(`  Code: ${input.codeLabel ?? "Unknown"}`);
  lines.push(`  Message: ${input.message}`);

  if (input.postgres?.sqlstate) {
    lines.push(`  SQLSTATE: ${input.postgres.sqlstate}`);
  }

  if (input.postgres?.sqlstateClass) {
    lines.push(`  SQLSTATE class: ${input.postgres.sqlstateClass}`);
  }

  if (input.postgres?.conditionName) {
    lines.push(`  Condition: ${input.postgres.conditionName}`);
  }

  if (input.postgres?.operation) {
    lines.push(`  Operation: ${input.postgres.operation}`);
  }

  if (input.retryGuidance) {
    lines.push(`  Retry guidance: ${input.retryGuidance}`);
  }

  if (input.message !== input.rawMessage) {
    lines.push(`  Transport message: ${input.rawMessage}`);
  }

  appendConnectDetails(lines, input.details);
  appendConnectMetadata(lines, input.metadata);
  appendConnectResponseBody(lines, input.context.response);

  return lines.join("\n");
}

function buildGenericTechnicalDetailsText(input: {
  codeLabel: string | null;
  context: AppUiErrorContext;
  rawMessage: string;
  source: AppErrorSource;
  stack: string | null;
  underlyingCause: unknown;
}) {
  const lines = ["ERROR:"];

  if (input.codeLabel) {
    lines.push(`  Code: ${input.codeLabel}`);
  }
  lines.push(`  Message: ${input.rawMessage}`);
  lines.push(`  Source: ${input.source}`);

  const contextDump = buildContextDump(input.context);
  if (contextDump) {
    lines.push("  Context:");
    lines.push(
      ...formatJsonBlockLines(contextDump, TECHNICAL_DETAILS_INDENT_SIZE)
    );
  }

  const serializedCause = serializeCause(input.underlyingCause);
  if (serializedCause !== null) {
    lines.push("  Cause:");
    lines.push(
      ...formatJsonBlockLines(serializedCause, TECHNICAL_DETAILS_INDENT_SIZE)
    );
  }

  if (input.stack) {
    lines.push("  Stack:");
    lines.push(...input.stack.split("\n").map((line) => `    ${line}`));
  }

  return lines.join("\n");
}

function buildTechnicalDetailsText(input: {
  codeLabel: string | null;
  connectDomain: string | null;
  connectReason: string | null;
  context: AppUiErrorContext;
  details: AppUiErrorDetail[];
  message: string;
  metadata: Record<string, string[]>;
  postgres: AppUiErrorPostgres | null;
  rawMessage: string;
  retryGuidance: string | null;
  source: AppErrorSource;
  stack: string | null;
  underlyingCause: unknown;
}) {
  const shouldRenderConnectTranscript =
    input.source === "connect" ||
    input.codeLabel !== null ||
    input.connectDomain !== null ||
    input.connectReason !== null ||
    input.details.length > 0 ||
    Object.keys(input.metadata).length > 0 ||
    hasRequestContext(input.context.request);

  if (shouldRenderConnectTranscript) {
    return buildConnectTechnicalDetailsText({
      codeLabel: input.codeLabel,
      context: input.context,
      details: input.details,
      message: input.message,
      metadata: input.metadata,
      postgres: input.postgres,
      rawMessage: input.rawMessage,
      retryGuidance: input.retryGuidance,
    });
  }

  return buildGenericTechnicalDetailsText({
    codeLabel: input.codeLabel,
    context: input.context,
    rawMessage: input.rawMessage,
    source: input.source,
    stack: input.stack,
    underlyingCause: input.underlyingCause,
  });
}

function buildErrorSectionContent(error: AppUiError): string {
  const lines = ["ERROR:"];

  if (error.codeLabel) {
    lines.push(`  Code: ${error.codeLabel}`);
  }
  lines.push(`  Message: ${error.message}`);

  if (error.message !== error.rawMessage) {
    lines.push(`  Transport message: ${error.rawMessage}`);
  }

  if (error.source !== "connect") {
    lines.push(`  Source: ${error.source}`);
  }

  if (error.connectReason) {
    lines.push(`  Reason: ${error.connectReason}`);
  }

  if (error.connectDomain) {
    lines.push(`  Domain: ${error.connectDomain}`);
  }

  if (error.postgres?.sqlstate) {
    lines.push(`  SQLSTATE: ${error.postgres.sqlstate}`);
  }

  if (error.postgres?.sqlstateClass) {
    lines.push(`  SQLSTATE class: ${error.postgres.sqlstateClass}`);
  }

  if (error.postgres?.conditionName) {
    lines.push(`  Condition: ${error.postgres.conditionName}`);
  }

  if (error.postgres?.operation) {
    lines.push(`  Operation: ${error.postgres.operation}`);
  }

  if (error.retryGuidance) {
    lines.push(`  Retry guidance: ${error.retryGuidance}`);
  }

  return lines.join("\n");
}

function buildMetadataSectionContent(
  metadata: Record<string, string[]>
): string | null {
  return Object.keys(metadata).length > 0
    ? JSON.stringify(metadata, null, 2)
    : null;
}

function buildResponseBodySection(
  error: AppUiError
): AppUiErrorTechnicalSection | null {
  const response = error.context.response;
  if (!response?.bodyText) {
    return null;
  }

  const content =
    response.bodyJson === null
      ? response.bodyText
      : JSON.stringify(response.bodyJson, null, 2);

  return {
    content: response.truncated
      ? `${content}\n[response snapshot truncated]`
      : content,
    id: "response-body",
    language:
      response.bodyJson === null
        ? inferTextLanguage(response.bodyText, response.contentType)
        : "json",
    title: "Failed response body",
  };
}

function parseSerializedJsonText(value: string): unknown {
  const trimmedValue = value.trim();
  if (
    !(
      (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) ||
      (trimmedValue.startsWith("[") && trimmedValue.endsWith("]"))
    )
  ) {
    return value;
  }

  try {
    return expandSerializedJsonValue(JSON.parse(trimmedValue));
  } catch {
    return value;
  }
}

function expandSerializedJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return parseSerializedJsonText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandSerializedJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandSerializedJsonValue(item),
      ])
    );
  }

  return value;
}

function buildCapturedErrorJsonSection(
  error: AppUiError
): AppUiErrorTechnicalSection | null {
  const downloadPayload = error.reproduction?.downloadPayload;
  if (!downloadPayload) {
    return null;
  }

  return {
    content: JSON.stringify(
      expandSerializedJsonValue(downloadPayload),
      null,
      2
    ),
    id: "captured-error-json",
    language: "json",
    title: "Captured error JSON",
  };
}

function buildAppUiErrorTechnicalSections(
  error: AppUiError
): AppUiErrorTechnicalSection[] {
  const sections: AppUiErrorTechnicalSection[] = [];
  const requestLines = buildGrpcurlRequestLines(error.context.request);

  if (requestLines.length > 0) {
    sections.push({
      content: requestLines.join("\n"),
      id: "request",
      language: "bash",
      title: "Request",
    });
  }

  sections.push({
    content: buildErrorSectionContent(error),
    id: "error",
    language: "yaml",
    title: "Error",
  });

  for (const [index, detail] of error.details.entries()) {
    sections.push({
      content: JSON.stringify(buildTranscriptDetailValue(detail), null, 2),
      id: `detail-${index + 1}`,
      language: "json",
      title: `Detail ${index + 1}`,
    });
  }

  const responseBodySection = buildResponseBodySection(error);
  if (responseBodySection) {
    sections.push(responseBodySection);
  }

  const metadataContent = buildMetadataSectionContent(error.metadata);
  if (metadataContent) {
    sections.push({
      content: metadataContent,
      id: "metadata",
      language: "json",
      title: "Response metadata",
    });
  }

  const capturedErrorJsonSection = buildCapturedErrorJsonSection(error);
  if (capturedErrorJsonSection) {
    sections.push(capturedErrorJsonSection);
  }

  if (error.source !== "connect") {
    const contextDump = buildContextDump(error.context);
    if (contextDump) {
      sections.push({
        content: JSON.stringify(contextDump, null, 2),
        id: "context",
        language: "json",
        title: "Context",
      });
    }

    const serializedCause = serializeCause(
      resolveUnderlyingCause(error.originalError)
    );
    if (serializedCause !== null) {
      sections.push({
        content: JSON.stringify(serializedCause, null, 2),
        id: "cause",
        language: "json",
        title: "Cause",
      });
    }

    if (error.stack) {
      sections.push({
        content: error.stack,
        id: "stack",
        language: inferTextLanguage(error.stack),
        title: "Stack",
      });
    }
  }

  return sections;
}

export {
  buildAppUiErrorTechnicalSections,
  buildTechnicalDetailsObject,
  buildTechnicalDetailsText,
  resolveUnderlyingCause,
};
