import type {
  AppErrorSource,
  AppUiErrorDetail,
  AppUiErrorReproduction,
  AppUiErrorRequestContext,
} from "@/lib/ui-error-types";
import {
  isRecord,
  REQUEST_FAILED_REPRO_DOWNLOAD_FILENAME,
} from "@/lib/ui-error-types";

const CONNECT_PROTOCOL_VERSION = "1";

function escapeShellSingleQuotes(input: string): string {
  return input.replaceAll("'", "'\\''");
}

function stripTypeUrlKey(
  value: Record<string, unknown>
): Record<string, unknown> {
  const { "@type": _ignoredTypeUrl, ...rest } = value;
  return rest;
}

function buildTranscriptDetailValue(
  detail: AppUiErrorDetail
): Record<string, unknown> {
  const typeUrl = `type.googleapis.com/${detail.type}`;

  if (isRecord(detail.debug)) {
    return {
      "@type": typeUrl,
      ...stripTypeUrlKey(detail.debug),
    };
  }

  const fallbackValue: Record<string, unknown> = {
    "@type": typeUrl,
    rawValuePresent: detail.hasRawValue,
    summary: detail.summary,
  };

  if (detail.postgres) {
    fallbackValue["postgres"] = detail.postgres;
  }

  if (detail.debug !== undefined && !(detail.debug instanceof Uint8Array)) {
    fallbackValue["debug"] = detail["debug"];
  }

  return fallbackValue;
}

function hasRequestContext(
  request: AppUiErrorRequestContext | undefined
): request is AppUiErrorRequestContext {
  return Boolean(
    request &&
      (request.headers ||
        request.host ||
        request.requestJson ||
        request.requestJsonNote ||
        request.requestMethod ||
        request.rpcPath ||
        request.url)
  );
}

function buildGrpcurlRequestLines(
  request: AppUiErrorRequestContext | undefined
): string[] {
  if (!(request?.host && request.rpcPath)) {
    return [];
  }

  const command = ["grpcurl"];
  if (request.plaintext) {
    command.push("-plaintext");
  }

  if (request.requestJson) {
    const escapedRequestJson = escapeShellSingleQuotes(
      request.requestJson
    ).split("\n");
    const requestFlagPrefix = `${command.join(" ")} -d '`;
    if (escapedRequestJson.length === 1) {
      return [
        `${requestFlagPrefix}${escapedRequestJson[0]}' ${request.host} ${request.rpcPath}`,
      ];
    }

    return [
      `${requestFlagPrefix}${escapedRequestJson[0]}`,
      ...escapedRequestJson.slice(1, -1),
      `${escapedRequestJson.at(-1) ?? ""}' ${request.host} ${request.rpcPath}`,
    ];
  }

  const lines = [`${command.join(" ")} ${request.host} ${request.rpcPath}`];
  if (request.requestJsonNote) {
    lines.push(`# ${request.requestJsonNote}`);
  }
  return lines;
}

function normalizeReproductionRequestHeaders(
  request: AppUiErrorRequestContext
): Record<string, string[]> {
  const headers = new Map<string, string[]>();

  for (const [key, values] of Object.entries(request.headers ?? {})) {
    if (values.length === 0) {
      continue;
    }

    headers.set(key.toLowerCase(), [...values]);
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", ["application/json"]);
  }

  if (!headers.has("connect-protocol-version")) {
    headers.set("connect-protocol-version", [CONNECT_PROTOCOL_VERSION]);
  }

  return Object.fromEntries(
    [...headers.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function buildCurlCommand(input: {
  headers: Record<string, string[]>;
  method: string;
  requestJson: string;
  url: string;
}): string {
  const lines = ["curl \\"];

  lines.push(`  -X ${input.method} \\`);

  for (const [key, values] of Object.entries(input.headers)) {
    for (const value of values) {
      lines.push(`  -H '${escapeShellSingleQuotes(`${key}: ${value}`)}' \\`);
    }
  }

  lines.push(`  '${escapeShellSingleQuotes(input.url)}' \\`);
  lines.push("  --data-binary @- <<'JSON'");
  lines.push(input.requestJson);
  lines.push("JSON");

  return lines.join("\n");
}

function buildReproduction(input: {
  hasConnectError: boolean;
  message: string;
  request: AppUiErrorRequestContext | undefined;
  source: AppErrorSource;
  technicalDetails: string;
  technicalDetailsText: string;
  title: string;
}): AppUiErrorReproduction | null {
  if (!input.hasConnectError || input.source === "setup_stream") {
    return null;
  }

  const requestContext = input.request;
  if (
    !(
      requestContext?.requestJson &&
      requestContext.requestMethod &&
      requestContext.rpcPath &&
      requestContext.url
    )
  ) {
    return null;
  }

  const headers = normalizeReproductionRequestHeaders(requestContext);
  const request = {
    body: requestContext.requestJson,
    headers,
    method: requestContext.requestMethod,
    rpcPath: requestContext.rpcPath,
    url: requestContext.url,
  };

  return {
    curlCommand: buildCurlCommand({
      headers,
      method: request.method,
      requestJson: request.body,
      url: request.url,
    }),
    downloadFilename: REQUEST_FAILED_REPRO_DOWNLOAD_FILENAME,
    downloadPayload: {
      message: input.message,
      request,
      technicalDetails: input.technicalDetails,
      title: input.title,
      transcript: input.technicalDetailsText,
      version: 1,
    },
  };
}

export {
  buildGrpcurlRequestLines,
  buildReproduction,
  buildTranscriptDetailValue,
  hasRequestContext,
};
