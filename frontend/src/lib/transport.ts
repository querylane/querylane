import { createRegistry } from "@bufbuild/protobuf";
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
import { createUnexpectedResponseFetch } from "@/lib/unexpected-response";
import { isNonEmptyString } from "@/lib/value-guards";
import { file_google_rpc_error_details } from "@/protogen/google/rpc/error_details_pb";
import { file_querylane_console_v1alpha1_errors } from "@/protogen/querylane/console/v1alpha1/errors_pb";
import { decideBlockingAppState } from "@/stores/blocking-app-state";
import { markSetupRequired } from "@/stores/setup-required-signal";

interface ConnectRequestLike {
  method?: { name?: string | undefined };
  service?: { typeName?: string | undefined };
}

const EXPECTED_FAILURE_RPC_PATH =
  "querylane.console.v1alpha1.InstanceService/TestInstanceConnection";

function getCurrentHref() {
  const browser = globalThis.window;
  if (browser === undefined) {
    return null;
  }
  const { pathname, search, hash } = browser.location;
  return `${pathname}${search}${hash}`;
}

function getRpcEndpoint(req: unknown) {
  if (typeof req !== "object" || req === null) {
    return "unknown.endpoint";
  }

  const connectRequest = req as ConnectRequestLike;
  const serviceName = connectRequest.service?.typeName ?? "unknown.service";
  const methodName = connectRequest.method?.name ?? "unknown";

  return `${serviceName}/${methodName}`;
}

async function applyBlockingDecision(
  decision: ReturnType<typeof decideBlockingAppState>,
  endpoint: string
) {
  if (decision.setupRequired) {
    logger.info("Setup required detected from API response", {
      endpoint,
    });
    markSetupRequired();
  }

  if (decision.blockingError) {
    const { useBlockingErrorStore } = await import(
      "@/stores/blocking-error-store"
    );
    useBlockingErrorStore
      .getState()
      .setBlockingError(decision.blockingError, decision.returnTo);
  }
}

const setupInterceptor: Interceptor = (next) => async (req) => {
  const endpoint = getRpcEndpoint(req);

  try {
    return await next(req);
  } catch (error) {
    const errorContext = {
      area: "transport",
      endpoint,
      source: "connect",
    } as const;
    attachAppUiErrorContext(error, errorContext);
    const uiError = normalizeAppUiError(error, errorContext);

    const blockingDecision = decideBlockingAppState({
      currentHref: getCurrentHref(),
      error: uiError,
    });
    await applyBlockingDecision(blockingDecision, endpoint);

    reportAppUiError(uiError, {
      expected: endpoint === EXPECTED_FAILURE_RPC_PATH,
      tags: {
        endpoint,
      },
    });

    throw error;
  }
};

interface ConnectBaseUrlOptions {
  configuredBaseUrl: string;
  isDevelopment: boolean;
  locationOrigin: string | null;
}

function resolveConnectBaseUrl({
  configuredBaseUrl,
  isDevelopment,
  locationOrigin: currentOrigin,
}: ConnectBaseUrlOptions) {
  const trimmedBaseUrl = configuredBaseUrl.trim();
  if (trimmedBaseUrl) {
    return trimmedBaseUrl;
  }

  if (isDevelopment || !isNonEmptyString(currentOrigin)) {
    return "http://localhost:8080";
  }

  return currentOrigin;
}

const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const LONG_RUNNING_RPC_TIMEOUT_MS = 90_000;

const locationOrigin = globalThis.location?.origin ?? null;
const connectBaseUrl = resolveConnectBaseUrl({
  configuredBaseUrl: env.PUBLIC_API_BASE_URL,
  isDevelopment: import.meta.env.DEV,
  locationOrigin,
});

const instanceRpcConcurrencyInterceptor =
  createInstanceRpcConcurrencyInterceptor();

const errorDetailRegistry = createRegistry(
  file_google_rpc_error_details,
  file_querylane_console_v1alpha1_errors
);

const appConnectFetch = createUnexpectedResponseFetch();

function createAppConnectTransport(defaultTimeoutMs: number) {
  return createConnectTransport({
    baseUrl: connectBaseUrl,
    defaultTimeoutMs,
    fetch: appConnectFetch,
    interceptors: [setupInterceptor, instanceRpcConcurrencyInterceptor],
    jsonOptions: { registry: errorDetailRegistry },
  });
}

const transport = createAppConnectTransport(DEFAULT_RPC_TIMEOUT_MS);
const longRunningTransport = createAppConnectTransport(
  LONG_RUNNING_RPC_TIMEOUT_MS
);

export { longRunningTransport, transport };
