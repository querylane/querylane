import { createRegistry, type DescMessage } from "@bufbuild/protobuf";
import type { Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { env } from "@/env";
import { logger } from "@/lib/diagnostics";
import { createInstanceRpcConcurrencyInterceptor } from "@/lib/instance-rpc-concurrency";
import {
  attachAppUiErrorContext,
  normalizeAppUiError,
  reportAppUiError,
} from "@/lib/ui-error";
import {
  type AppUiErrorRequestContext,
  CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
  CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_HEADER,
  CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER,
  CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER,
  REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
  STREAMING_INPUT_REQUEST_MESSAGE,
} from "@/lib/ui-error-types";
import { file_google_rpc_error_details } from "@/protogen/google/rpc/error_details_pb";
import { file_querylane_console_v1alpha1_errors } from "@/protogen/querylane/console/v1alpha1/errors_pb";
import { decideBlockingAppState } from "@/stores/blocking-app-state";
import { markSetupRequired } from "@/stores/setup-required-signal";

/**
 * Global interceptor that normalizes ConnectRPC failures from any API call,
 * reports them once, and updates global blocker/setup state for route redirects.
 */
interface BlockingErrorStoreModule {
  useBlockingErrorStore: {
    getState: () => {
      setBlockingError: (
        error: ReturnType<typeof normalizeAppUiError>,
        returnTo?: string | null
      ) => void;
    };
  };
}

interface SetupInterceptorDependencies {
  getCurrentHref: () => string | null;
  loadBlockingErrorStore: () => Promise<BlockingErrorStoreModule>;
  logger: typeof logger;
  markSetupRequired: () => void;
}

interface ConnectRequestLike {
  header?: HeadersInit | undefined;
  message?: unknown | undefined;
  method?: {
    input?: DescMessage | undefined;
    name?: string | undefined;
  };
  requestMethod?: string | undefined;
  service?: {
    typeName?: string | undefined;
  };
  stream?: boolean | undefined;
  url?: string | undefined;
}

const MAX_CAPTURED_ERROR_BODY_CHARACTERS = 4096;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_RESET_CONTENT = 205;
const HTTP_STATUS_NOT_MODIFIED = 304;
const NULL_BODY_RESPONSE_STATUSES = new Set([
  HTTP_STATUS_NO_CONTENT,
  HTTP_STATUS_RESET_CONTENT,
  HTTP_STATUS_NOT_MODIFIED,
]);
type TransportFetch = typeof globalThis.fetch;
type FetchPreconnect = (url: string | URL) => void;
type FetchImplementation = typeof globalThis.fetch;
type PreconnectFetch = FetchImplementation & {
  preconnect?: FetchPreconnect | undefined;
};

const defaultSetupInterceptorDependencies: SetupInterceptorDependencies = {
  getCurrentHref: () =>
    typeof window === "undefined"
      ? null
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  loadBlockingErrorStore: () => import("@/stores/blocking-error-store"),
  logger,
  markSetupRequired,
};

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function shouldCaptureFailedResponse(response: Response): boolean {
  if (NULL_BODY_RESPONSE_STATUSES.has(response.status)) {
    return false;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok) {
    return true;
  }

  return !(
    contentType.includes("application/connect+json") ||
    contentType.includes("application/connect+proto") ||
    contentType.includes("application/json") ||
    contentType.includes("application/proto")
  );
}

async function createResponseSnapshot(response: Response): Promise<Response> {
  if (!shouldCaptureFailedResponse(response)) {
    return response;
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch {
    return response;
  }

  const truncated = bodyText.length > MAX_CAPTURED_ERROR_BODY_CHARACTERS;
  const snapshotText = truncated
    ? bodyText.slice(0, MAX_CAPTURED_ERROR_BODY_CHARACTERS)
    : bodyText;
  const headers = new Headers(response.headers);

  if (bodyText.length > 0) {
    headers.set(
      CONNECT_ERROR_SNAPSHOT_BODY_HEADER,
      encodeBase64Utf8(snapshotText)
    );
    headers.set(
      CONNECT_ERROR_SNAPSHOT_CONTENT_TYPE_HEADER,
      response.headers.get("content-type") ?? ""
    );
    headers.set(CONNECT_ERROR_SNAPSHOT_STATUS_HEADER, String(response.status));
    headers.set(CONNECT_ERROR_SNAPSHOT_STATUS_TEXT_HEADER, response.statusText);
    if (truncated) {
      headers.set(CONNECT_ERROR_SNAPSHOT_TRUNCATED_HEADER, "1");
    }
  }

  return new Response(bodyText, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function createObservedConnectFetch(
  fetchImplementation: FetchImplementation = globalThis.fetch
): PreconnectFetch {
  const observedFetch = async (
    input: Parameters<TransportFetch>[0],
    init?: Parameters<TransportFetch>[1]
  ) => {
    const response = await fetchImplementation(input, init);
    return createResponseSnapshot(response);
  };

  let preconnect: FetchPreconnect | undefined;
  if (hasFetchPreconnect(fetchImplementation)) {
    preconnect = fetchImplementation.preconnect.bind(fetchImplementation);
  } else {
    const defaultFetch = globalThis.fetch;
    if (hasFetchPreconnect(defaultFetch)) {
      preconnect = defaultFetch.preconnect.bind(defaultFetch);
    }
  }

  return Object.assign(observedFetch, preconnect ? { preconnect } : {});
}

function hasFetchPreconnect(
  value: FetchImplementation
): value is FetchImplementation & { preconnect: FetchPreconnect } {
  return "preconnect" in value && typeof value.preconnect === "function";
}

function parseRequestUrl(url: string | null): {
  host: string | null;
  plaintext: boolean;
} {
  if (!url) {
    return {
      host: null,
      plaintext: false,
    };
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.host || null,
      plaintext: parsed.protocol === "http:",
    };
  } catch {
    return {
      host: null,
      plaintext: false,
    };
  }
}

function getRpcEndpoint(req: unknown): string {
  if (typeof req !== "object" || req === null) {
    return "unknown.endpoint";
  }

  const connectRequest = req as ConnectRequestLike;
  const serviceName = connectRequest.service?.typeName ?? "unknown.service";
  const methodName = connectRequest.method?.name ?? "unknown";

  return `${serviceName}/${methodName}`;
}

async function buildRequestJsonSnapshot(req: ConnectRequestLike): Promise<{
  requestJson: string | null;
  requestJsonNote: string | null;
}> {
  if (req.stream === true) {
    return {
      requestJson: null,
      requestJsonNote: STREAMING_INPUT_REQUEST_MESSAGE,
    };
  }

  if (req.message === undefined) {
    return {
      requestJson: null,
      requestJsonNote: null,
    };
  }

  const { isMessage, toJsonString } = await import("@bufbuild/protobuf");
  if (!(req.method?.input && isMessage(req.message))) {
    return {
      requestJson: null,
      requestJsonNote: REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
    };
  }

  try {
    return {
      requestJson: toJsonString(req.method.input, req.message, {
        prettySpaces: 2,
      }),
      requestJsonNote: null,
    };
  } catch {
    return {
      requestJson: null,
      requestJsonNote: REQUEST_PAYLOAD_SERIALIZATION_FAILURE_MESSAGE,
    };
  }
}

function normalizeRequestHeaders(
  headers: HeadersInit | undefined
): Record<string, string[]> | null {
  if (!headers) {
    return null;
  }

  const normalizedHeaders = new Headers(headers);
  const entries = new Map<string, string[]>();

  normalizedHeaders.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "authorization" || normalizedKey === "cookie") {
      return;
    }

    const existing = entries.get(normalizedKey) ?? [];
    existing.push(value);
    entries.set(normalizedKey, existing);
  });

  return entries.size > 0 ? Object.fromEntries(entries.entries()) : null;
}

async function buildRequestContext(
  req: unknown
): Promise<AppUiErrorRequestContext | undefined> {
  if (typeof req !== "object" || req === null) {
    return;
  }

  const connectRequest = req as ConnectRequestLike;
  const endpoint = getRpcEndpoint(connectRequest);
  const url = connectRequest.url ?? null;
  const { host, plaintext } = parseRequestUrl(url);
  const { requestJson, requestJsonNote } =
    await buildRequestJsonSnapshot(connectRequest);

  return {
    headers: normalizeRequestHeaders(connectRequest.header),
    host,
    plaintext,
    requestJson,
    requestJsonNote,
    requestMethod: connectRequest.requestMethod ?? null,
    rpcPath: endpoint,
    url,
  };
}

function createSetupInterceptor(
  dependencies: SetupInterceptorDependencies = defaultSetupInterceptorDependencies
): Interceptor {
  return (next) => async (req) => {
    const endpoint = getRpcEndpoint(req);

    try {
      return await next(req);
    } catch (err) {
      const request: AppUiErrorRequestContext | undefined =
        await buildRequestContext(req).catch(
          (
            requestContextError: unknown
          ): AppUiErrorRequestContext | undefined => {
            dependencies.logger.warn(
              "Failed to build API error request context",
              {
                endpoint,
                error: requestContextError,
              }
            );
            return;
          }
        );
      attachAppUiErrorContext(err, {
        area: "transport",
        endpoint,
        request,
        source: "connect",
      });
      const uiError = normalizeAppUiError(err, {
        area: "transport",
        endpoint,
        request,
        source: "connect",
      });

      const blockingDecision = decideBlockingAppState({
        currentHref: dependencies.getCurrentHref(),
        error: uiError,
      });

      if (blockingDecision.setupRequired) {
        dependencies.logger.info("Setup required detected from API response", {
          endpoint,
        });

        dependencies.markSetupRequired();
      }

      if (blockingDecision.blockingError) {
        const { useBlockingErrorStore } =
          await dependencies.loadBlockingErrorStore();
        useBlockingErrorStore
          .getState()
          .setBlockingError(
            blockingDecision.blockingError,
            blockingDecision.returnTo
          );
      }

      reportAppUiError(uiError, {
        tags: {
          endpoint,
        },
      });

      throw err;
    }
  };
}

const setupInterceptor = createSetupInterceptor();

interface ConnectBaseUrlOptions {
  configuredBaseUrl: string;
  isDevelopment: boolean;
  locationOrigin: string | null;
}

function resolveConnectBaseUrl({
  configuredBaseUrl,
  isDevelopment,
  locationOrigin,
}: ConnectBaseUrlOptions): string {
  const trimmedBaseUrl = configuredBaseUrl.trim();
  if (trimmedBaseUrl) {
    return trimmedBaseUrl;
  }

  if (isDevelopment || !locationOrigin) {
    return "http://localhost:8080";
  }

  return locationOrigin;
}

/**
 * Client-side deadline for every RPC. Aborting the fetch at the deadline frees
 * the browser's per-origin connection slot (a hanging instance would otherwise
 * starve all RPCs app-wide), and the Connect-Timeout-Ms header propagates the
 * deadline to the backend so its work is canceled too. 30s matches the
 * server-side statement_timeout applied to ReadRows, so a legitimate slow read
 * is never cut short by the client.
 */
const DEFAULT_RPC_TIMEOUT_MS = 30_000;
/**
 * Deadline for RPCs that may legitimately run long (e.g. EXPLAIN ANALYZE,
 * which the backend caps at 60s). Kept above the server cap plus grace so the
 * server-side limit always fires first.
 */
const LONG_RUNNING_RPC_TIMEOUT_MS = 90_000;

const locationOrigin =
  typeof window === "undefined" ? null : window.location.origin;
const connectBaseUrl = resolveConnectBaseUrl({
  configuredBaseUrl: env.PUBLIC_API_BASE_URL,
  isDevelopment: import.meta.env.DEV,
  locationOrigin,
});

/**
 * One shared limiter across both transports so the per-instance concurrency
 * cap covers every RPC regardless of which deadline tier it uses. It sits
 * after (inside) the setup interceptor so failures raised while a request is
 * queued still flow through error normalization and reporting.
 */
const instanceRpcConcurrencyInterceptor =
  createInstanceRpcConcurrencyInterceptor();

/**
 * Registry of the `google.protobuf.Any` detail types the backend packs into
 * `google.rpc.Status.details` on partial errors (e.g. GetInstanceOverview,
 * CheckInstanceHealth, QueryMetrics). Without it, connect cannot decode those
 * Any values from JSON and the whole response fails to deserialize.
 */
const errorDetailRegistry = createRegistry(
  file_google_rpc_error_details,
  file_querylane_console_v1alpha1_errors
);

function createAppConnectTransport(defaultTimeoutMs: number) {
  return createConnectTransport({
    baseUrl: connectBaseUrl,
    defaultTimeoutMs,
    fetch: createObservedConnectFetch(globalThis.fetch),
    interceptors: [setupInterceptor, instanceRpcConcurrencyInterceptor],
    jsonOptions: { registry: errorDetailRegistry },
  });
}

const transport = createAppConnectTransport(DEFAULT_RPC_TIMEOUT_MS);
const longRunningTransport = createAppConnectTransport(
  LONG_RUNNING_RPC_TIMEOUT_MS
);

export {
  createObservedConnectFetch,
  createSetupInterceptor,
  DEFAULT_RPC_TIMEOUT_MS,
  LONG_RUNNING_RPC_TIMEOUT_MS,
  longRunningTransport,
  resolveConnectBaseUrl,
  transport,
};
